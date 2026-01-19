FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/

# Expose the bot port
EXPOSE 3978

# Start the bot
CMD ["node", "src/index.mjs"]
