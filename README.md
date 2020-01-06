
# Mockstagram crawler solution


Detailed design, explanation, setup and profiling are in **documentation.pdf**.

  ## Requirements
  ### Node
- You must have npm and node installed on your machine
- See here how to do so: https://nodejs.org/en/

### Docker
- You must have Docker installed on the machine
- See here how to do so: https://docs.docker.com/install/linux/docker-ce/ubuntu/
-  The setup has been tested on Docker version 18.09.1-rc1.
  

# Setup summary
- create a folder `/choose/a/folder` in your machine for storing data from this setup
- clone this repo
- cd into the repo
- run `node ./infraSetup/runMe.js /choose/a/folder`
- run `npm i --save`
- run `node ./crawler/crawlerManager.js`

