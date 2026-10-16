// Phusion Passenger entry point for Serv00.
//
// Serv00 runs a Node.js website by executing `app.js` in the project root
// (<domains>/<DOMAIN>/public_nodejs/app.js) and providing the listening
// socket itself — the port number inside server.js is ignored by Passenger.
//
// `deploy/serv00/setup.sh` copies this file to the project root as `app.js`.
// It is one line on purpose: everything real lives in whatsapp/server.js.
import './whatsapp/server.js';
