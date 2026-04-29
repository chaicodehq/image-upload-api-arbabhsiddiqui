FROM node:24

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

CMD ["tail", "-f", "/dev/null"]