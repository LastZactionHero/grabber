package main

import (
	"encoding/json"
	"log"
	"time"

	"github.com/go-martini/martini"
	"github.com/streadway/amqp"
)

type initialGrabRequestMessage struct {
	RequestToken string `json:"request_token"`
	RequestType  string `json:"request_type"`
	URL          string `json:"url"`
}

func main() {
	time.Sleep(5 * time.Second) // TODO: Fix this! Waiting for messaging to start
	go receiveResponseMessages()

	m := martini.Classic()
	m.Get("/", func() string {
		go sendInitialGrabRequest()
		return "Hello World!"
	})
	m.Run()
}

func receiveResponseMessages() {
	conn, err := amqp.Dial("amqp://messaging:5672/")
	failOnError(err, "Failed to connect to RabbitMQ")
	defer conn.Close()

	ch, err := conn.Channel()
	failOnError(err, "Failed to open a channel")
	defer ch.Close()

	q, err := ch.QueueDeclare(
		"phantom_response", // name
		false,              // durable
		false,              // delete when unused
		false,              // exclusive
		false,              // no-wait
		nil,                // arguments
	)
	failOnError(err, "Failed to declare a queue")

	msgs, err := ch.Consume(
		q.Name, // queue
		"",     // consumer
		true,   // auto-ack
		false,  // exclusive
		false,  // no-local
		false,  // no-wait
		nil,    // args
	)
	failOnError(err, "Failed to register a consumer")

	forever := make(chan bool)

	go func() {
		for d := range msgs {
			log.Printf("Received a message: %s", d.Body)
		}
	}()

	log.Printf(" [*] Waiting for messages. To exit press CTRL+C")
	<-forever
}

func sendInitialGrabRequest() {
	requestMessageJSON, err := initialGrabRequestJSON("ABCD1234", "https://ethereumprice.org/")
	failOnError(err, "Failed to create request message JSON")
	sendRequestMessage(requestMessageJSON, "phantom_request")
}

func initialGrabRequestJSON(requestToken string, url string) (jsonString []byte, err error) {
	requestMessage := initialGrabRequestMessage{
		RequestToken: requestToken,
		RequestType:  "initial_grab",
		URL:          url}
	return json.Marshal(requestMessage)
}

func sendRequestMessage(requestMessageJSON []byte, queueName string) {
	conn, err := amqp.Dial("amqp://messaging:5672/")
	failOnError(err, "Failed to connect to RabbitMQ")
	defer conn.Close()

	ch, err := conn.Channel()
	failOnError(err, "Failed to open a channel")
	defer ch.Close()

	q, err := ch.QueueDeclare(
		queueName, // name
		false,     // durable
		false,     // delete when unused
		false,     // exclusive
		false,     // no-wait
		nil,       // arguments
	)
	failOnError(err, "Failed to declare a queue")

	err = ch.Publish(
		"",     // exchange
		q.Name, // routing key
		false,  // mandatory
		false,  // immediate
		amqp.Publishing{
			ContentType: "application/json",
			Body:        requestMessageJSON,
		})
	log.Printf(" [x] Sent %s", requestMessageJSON)
	failOnError(err, "Failed to publish a message")
}

func failOnError(err error, msg string) {
	if err != nil {
		log.Fatalf("%s: %s", msg, err)
	}
}
