# BrowserDataProtection Architecture

This repository contains a proof-of-concept implementation of the BrowserDataProtection architecture, which I have designed during the work on my dissertation.
BrowserDataProtection offers browser-based encryption of user input to protect against malicious web applications.
User input entered through BrowserDataProtection is never shared with the client-side code of the web application without applying authenticated encryption before.

The proof of concept is implemented as a browser extension and targets the Chrome browser, but can be ported to other browser with support for the WebExtension API with some modifications.
The architecture is explained in my doctoral dissertation, which has been accepted by the Universität Hamburg in 2024.

Pascal Wichmann. *Protection of Security-Critical Web Applications.* Doctoral dissertation. Universität Hamburg. February 2024.

## Usage

To build the browser extension, the tool [webextension-toolbox](https://github.com/webextension-toolbox/webextension-toolbox) is required.
Follow the instructions of the upstream GitHub repository for installation of the dependency.

After installation, the browser extension can be built using the following command:

`webextension-toolbox build`

Currently, the extension only supports Chromium-based browsers.
The built extension can be loaded from the browser's extension settings by navigating to the folder in the `dist` directory.

## Example Web Application

The directory `demo-page` in this repository contains an example web application that demonstrates BrowserDataProtection's functionality.
To serve the application with its full functionality, you need Python and the package simiple_websocket_server installed on your system.
Navigate to the `demo-page` directory and serve the application on localhost:8000 with the following command:

```
python3 -m http.server
```

Also, run the WebSocket server for the key agreement demo with the following command (on a Unix system):

```
./demo_websocket_server.py
```

Alternatively, you can also host the `demo-page` directory as a static web application (for example with Python's built-in HTTP server as above, `python3 -m http.server`, or with any other HTTP server software capable of serving static files).
However, the key agreement demo will not be functional in this setup.
