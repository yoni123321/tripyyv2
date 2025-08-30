const { Pool } = require('pg');
require('dotenv').config();

// Import fetch for Node.js compatibility
const fetch = require('node-fetch');

class LLMService {
  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    
    // Rate limits per account type (requests per month)
    this.rateLimits = {
      traveler: 50,
      pro: 200,
      creator: 500
    };
    
    // Anthropic API configuration
    this.anthropicConfig = {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: 'claude-3-haiku-20240307',
      baseUrl: 'https://api.anthropic.com/v1/messages'
    };
  }

  /**
   * Check if user has exceeded their rate limit
   */
  async checkRateLimit(userId, accountType = 'traveler') {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7); // Format: '2024-01'
      const limit = this.rateLimits[accountType] || this.rateLimits.traveler;
      
      // Get or create usage record for current month
      let usage = await this.getOrCreateUsageRecord(userId, accountType, currentMonth);
      
      if (usage.requests_used >= limit) {
        return {
          allowed: false,
          limit,
          used: usage.requests_used,
          resetDate: this.getNextMonthDate(currentMonth)
        };
      }
      
      return {
        allowed: true,
        limit,
        used: usage.requests_used,
        remaining: limit - usage.requests_used
      };
    } catch (error) {
      console.error('Rate limit check error:', error);
      // Allow request if we can't check rate limit
      return { allowed: true, limit: 50, used: 0, remaining: 50 };
    }
  }

  /**
   * Get or create usage record for user/month
   */
  async getOrCreateUsageRecord(userId, accountType, monthYear) {
    try {
      // Try to get existing record
      let result = await this.pool.query(
        'SELECT * FROM llm_usage WHERE user_id = $1 AND month_year = $2',
        [userId, monthYear]
      );
      
      if (result.rows.length > 0) {
        return result.rows[0];
      }
      
      // Create new record if none exists
      result = await this.pool.query(
        'INSERT INTO llm_usage (user_id, account_type, month_year) VALUES ($1, $2, $3) RETURNING *',
        [userId, accountType, monthYear]
      );
      
      return result.rows[0];
    } catch (error) {
      console.error('Error getting/creating usage record:', error);
      throw error;
    }
  }

  /**
   * Increment usage count for user
   */
  async incrementUsage(userId, monthYear) {
    try {
      await this.pool.query(
        'UPDATE llm_usage SET requests_used = requests_used + 1, updated_at = CURRENT_TIMESTAMP WHERE user_id = $1 AND month_year = $2',
        [userId, monthYear]
      );
    } catch (error) {
      console.error('Error incrementing usage:', error);
      // Don't throw - we don't want to fail the chat request if usage tracking fails
    }
  }

  /**
   * Get next month date for rate limit reset
   */
  getNextMonthDate(currentMonth) {
    const [year, month] = currentMonth.split('-').map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextYear = month === 12 ? year + 1 : year;
    return `${nextYear}-${nextMonth.toString().padStart(2, '0')}`;
  }

  /**
   * Send chat request to Anthropic Claude
   */
  async sendChatRequest(messages, systemPrompt = null) {
    try {
      if (!this.anthropicConfig.apiKey) {
        throw new Error('Anthropic API key not configured');
      }

      const requestBody = {
        model: this.anthropicConfig.model,
        max_tokens: 1000,
        messages: messages
      };

      if (systemPrompt) {
        requestBody.system = systemPrompt;
      }

      const response = await fetch(this.anthropicConfig.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.anthropicConfig.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`Anthropic API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      
      return {
        success: true,
        content: data.content[0].text,
        model: data.model,
        usage: {
          input_tokens: data.usage.input_tokens,
          output_tokens: data.usage.output_tokens
        }
      };
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw error;
    }
  }

  /**
   * Process chat request with rate limiting and usage tracking
   */
  async processChatRequest(userId, userMessage, context = {}, accountType = 'traveler') {
    try {
      // Check rate limit
      const rateLimitCheck = await this.checkRateLimit(userId, accountType);
      if (!rateLimitCheck.allowed) {
        return {
          success: false,
          error: 'Rate limit exceeded',
          rateLimit: rateLimitCheck,
          statusCode: 429
        };
      }

      // Prepare messages for Anthropic
      const messages = [
        {
          role: 'user',
          content: this.formatUserMessage(userMessage, context)
        }
      ];

      // System prompt for travel planning
      const systemPrompt = `You are an AI travel planning assistant for Tripyy. Help users plan their perfect trip by:
- Providing personalized travel recommendations
- Suggesting activities based on interests and budget
- Offering practical travel tips
- Helping with itinerary planning
- Considering destination-specific information

Keep responses helpful, concise, and focused on travel planning.`;

      // Send request to Anthropic
      const aiResponse = await this.sendChatRequest(messages, systemPrompt);
      
      // Track usage
      const currentMonth = new Date().toISOString().slice(0, 7);
      await this.incrementUsage(userId, currentMonth);

      return {
        success: true,
        data: {
          content: aiResponse.content,
          model: aiResponse.model,
          usage: aiResponse.usage
        },
        message: 'Chat response generated successfully'
      };

    } catch (error) {
      console.error('Chat request processing error:', error);
      return {
        success: false,
        error: 'Failed to process chat request',
        details: error.message,
        statusCode: 500
      };
    }
  }

  /**
   * Format user message with context for better AI responses
   */
  formatUserMessage(message, context) {
    let formattedMessage = message;
    
    if (context.destination) {
      formattedMessage += `\n\nContext: Planning a trip to ${context.destination}`;
    }
    
    if (context.dates) {
      formattedMessage += `\nDates: ${context.dates.startDate} to ${context.dates.endDate}`;
    }
    
    if (context.budget) {
      formattedMessage += `\nBudget: ${context.budget}`;
    }
    
    if (context.interests && context.interests.length > 0) {
      formattedMessage += `\nInterests: ${context.interests.join(', ')}`;
    }
    
    if (context.numberOfTravelers) {
      formattedMessage += `\nTravelers: ${context.numberOfTravelers}`;
    }
    
    return formattedMessage;
  }

  /**
   * Get user's current usage and limits
   */
  async getUserUsage(userId, accountType = 'traveler') {
    try {
      const currentMonth = new Date().toISOString().slice(0, 7);
      const limit = this.rateLimits[accountType] || this.rateLimits.traveler;
      
      const result = await this.pool.query(
        'SELECT * FROM llm_usage WHERE user_id = $1 AND month_year = $2',
        [userId, currentMonth]
      );
      
      const usage = result.rows[0] || { requests_used: 0 };
      
      return {
        success: true,
        data: {
          currentMonth,
          accountType,
          limit,
          used: usage.requests_used,
          remaining: limit - usage.requests_used,
          resetDate: this.getNextMonthDate(currentMonth)
        }
      };
    } catch (error) {
      console.error('Error getting user usage:', error);
      return {
        success: false,
        error: 'Failed to get usage information'
      };
    }
  }

  /**
   * Health check for LLM service
   */
  async healthCheck() {
    try {
      // Check database connection
      await this.pool.query('SELECT 1');
      
      // Check Anthropic API key
      const hasApiKey = !!this.anthropicConfig.apiKey;
      
      return {
        success: true,
        data: {
          status: 'healthy',
          database: 'connected',
          anthropic: hasApiKey ? 'configured' : 'not_configured',
          timestamp: new Date().toISOString()
        }
      };
    } catch (error) {
      return {
        success: false,
        error: 'Service unhealthy',
        details: error.message
      };
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

module.exports = new LLMService();
