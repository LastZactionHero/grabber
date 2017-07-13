FROM node:latest

RUN apt-get update -qq

RUN mkdir /app

ADD . /app

WORKDIR /root
COPY ./app/phantomjs-2.1.1-linux-x86_64.tar.bz2 phantomjs-2.1.1-linux-x86_64.tar.bz2
RUN tar jxf phantomjs-2.1.1-linux-x86_64.tar.bz2
RUN rm phantomjs-2.1.1-linux-x86_64.tar.bz2
RUN ln -s /root/phantomjs-2.1.1-linux-x86_64/bin/phantomjs /usr/local/bin/

WORKDIR /app