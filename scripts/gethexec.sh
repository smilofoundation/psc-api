#!/bin/bash
geth --exec "loadScript(\"$1\")" attach http://localhost:22000
