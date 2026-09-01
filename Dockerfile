FROM mcr.microsoft.com/playwright:v1.41.2-jammy

WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install

COPY . .

CMD [ "node", "bot.js" ]
