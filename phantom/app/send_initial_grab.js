var amqp = require('amqplib/callback_api');

amqp.connect('amqp://messaging', function(err, conn) {

  conn.createChannel(function(err, channel) {
    var requestQueueName = 'phantom_request';
    var responseQueueName = 'phantom_response';

    channel.assertQueue(requestQueueName, {durable: false});
    channel.assertQueue(responseQueueName, {durable: false});

    channel.consume(responseQueueName, function(msg) {
      console.log("Received Response")
      var message = JSON.parse(msg.content.toString());

      console.log(message)
      message.grab_content.forEach( (selectorContent) => {
        console.log(selectorContent.selector_path)
        console.log(selectorContent.text)
      });
    }, {noAck: true});

    var message = {
      request_token: 'ABCD1234',
      request_type: 'initial_grab',
      url: 'https://waterdata.usgs.gov/nwis/uv?06730200'
    }
    channel.sendToQueue(requestQueueName, new Buffer(JSON.stringify(message)));
    console.log(" [x] Sent message");
  });
});