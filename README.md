# BrowserDataProtection Architecture

This repository contains a proof-of-concept implementation of the BrowserDataProtection architecture, which I have designed during the work on my dissertation.
BrowserDataProtection offers browser-based encryption of user input to protect against malicious web applications.
User input entered through BrowserDataProtection is never shared with the client-side code of the web application without applying authenticated encryption before.

The proof of concept is implemented as a browser extension and targets the Chrome browser, but can be ported to other browser with support for the WebExtension API with some modifications.
The architecture is explained in my dissertation, which is currently under review:

Pascal Wichmann. *Protection of Security-Critical Web Applications.* Submitted dissertation (under review). February 2024.
