package main

import (
	"fmt"

	"github.com/go-martini/martini"
)

func main() {
	fmt.Println("Hi!")
	m := martini.Classic()
	m.Get("/", func() string {
		return "Hello World!"
	})
	m.Run()
}
