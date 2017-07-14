FROM golang:latest

RUN mkdir /go/src/app
ADD ./app /go/src/app
WORKDIR /go/src/app

RUN go get ./...
RUN go build ./api.go
RUN go install