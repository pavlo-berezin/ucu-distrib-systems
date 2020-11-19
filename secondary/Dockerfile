FROM node:12

WORKDIR app

COPY package.json package-lock.json ./

COPY ./secondary/ ./secondary

COPY ./messages.proto ./

RUN npm i