FROM node:12

WORKDIR app

COPY package.json package-lock.json ./

COPY ./main/ ./main

COPY ./messages.proto ./

RUN npm i