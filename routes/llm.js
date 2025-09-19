const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const llmService = require('../src/services/llm-service');

// Middleware to authenticate user (defined in server-simple.js)
const authenticateUser = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.substring(7);
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
};

/**
 * POST /api/llm/chat
 * Main chat endpoint using backend default Anthropic key
 */
router.post('/chat', authenticateUser, async (req, res) => {
  try {
    const { message, context = {}, processedPrompt, metadata = {} } = req.body;
    
    if (!message || typeof message !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Message is required and must be a string'
      });
    }

    // Get user's account type from their profile (default to 'traveler')
    const accountType = req.user.accountType || 'traveler';
    
    // Prepare processed data for unified processing
    const processedData = processedPrompt ? {
      processedPrompt,
      metadata
    } : null;
    
    // Process chat request with rate limiting and usage tracking
    const result = await llmService.processChatRequest(
      req.userId,
      message,
      context,
      accountType,
      processedData
    );

    if (!result.success) {
      // Handle rate limit exceeded
      if (result.statusCode === 429) {
        return res.status(429).json({
          success: false,
          error: result.error,
          rateLimit: result.rateLimit,
          message: `Rate limit exceeded. You've used ${result.rateLimit.used}/${result.rateLimit.limit} requests this month. Reset on ${result.rateLimit.resetDate}.`
        });
      }
      
      // Handle other errors
      return res.status(result.statusCode || 500).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    // Success response
    res.json({
      success: true,
      data: {
        content: result.data.content,
        model: result.data.model,
        usage: result.data.usage
      },
      message: result.message
    });

  } catch (error) {
    console.error('LLM chat endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to process chat request'
    });
  }
});

/**
 * GET /api/llm/usage
 * Get user's current usage and limits
 */
router.get('/usage', authenticateUser, async (req, res) => {
  try {
    // Get user's account type from their profile (default to 'traveler')
    const accountType = req.user.accountType || 'traveler';
    
    const result = await llmService.getUserUsage(req.userId, accountType);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        error: result.error
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('LLM usage endpoint error:', error);
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'Failed to get usage information'
    });
  }
});

/**
 * GET /api/llm/health
 * Health check endpoint
 */
router.get('/health', async (req, res) => {
  try {
    const result = await llmService.healthCheck();
    
    if (!result.success) {
      return res.status(503).json({
        success: false,
        error: result.error,
        details: result.details
      });
    }

    res.json({
      success: true,
      data: result.data
    });

  } catch (error) {
    console.error('LLM health check error:', error);
    res.status(503).json({
      success: false,
      error: 'Service unavailable',
      message: 'LLM service health check failed'
    });
  }
});

module.exports = router;
