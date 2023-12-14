#!/bin/bash

mkdir -p slack-archive_USERDATA
docker build -t slack-archive:dev .
docker run --mount type=bind,source="$(pwd)"/slack-archive_USERDATA,target=/slack-archive/slack-archive -it slack-archive:dev
