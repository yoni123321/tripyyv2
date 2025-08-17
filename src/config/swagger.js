const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Tripyy API',
      version: '1.0.0',
      description: 'API for Tripyy travel application'
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3000',
        description: 'Development server'
      }
    ]
  },
  apis: ['./server-simple.js', './src/routes/*.js']
};

module.exports = swaggerJsdoc(options);