# Create a node image
FROM node:latest
MAINTAINER siannilli <stefano.iannilli@gmail.com>

# Creates project dir and install typescript compiler and typings
RUN mkdir -p /usr/src/app && \
    npm install typescript@latest --global && \
    npm install typings --global

COPY ./ /usr/src/app

WORKDIR /usr/src/app

# Compiles the source code. --unsafe-perm required to avoid project install failure, as npm ran as root in a Docker container
# see https://docs.npmjs.com/misc/scripts#user
RUN npm install --unsafe-perm

EXPOSE 3000

CMD ["npm", "start"]