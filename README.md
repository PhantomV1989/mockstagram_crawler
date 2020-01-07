

  

# Mockstagram crawler solution

  
  

Detailed design, explanation, setup and profiling are in **documentation.pdf**.

  

## Requirements

### Node

- You must have npm and node installed on your machine

- See here how to do so: https://nodejs.org/en/

  

### Docker

- You must have Docker installed on the machine

- See here how to do so: https://docs.docker.com/install/linux/docker-ce/ubuntu/

- The setup has been tested on Docker version 18.09.1-rc1.

  

# Setup summary

- create a folder `/choose/a/folder` on your machine for storing data from this setup

- clone this repo

- cd into the repo

- run `node ./infraSetup/runMe.js /choose/a/folder`

- run `npm i --save`

- run `node ./crawler/crawlerManager.js`

# Usage
The crawler manager listens to port 30000. To start crawling tasks for :pk values, send HTTP POST request to /start_crawling_users with the following format:

>POST localhost:30000/start_crawling_users
>{
>    'users': [1000001, 1996161, 1787381],
>    'intervalSec': 5
>}

Alternatively, you can use a stress test function as follows:

`node ./crawler/crawlerStressTest.js 20`

This sends 20 randomly generated :pk values with 1 second crawling interval to crawler manager to start crawling tasks.
