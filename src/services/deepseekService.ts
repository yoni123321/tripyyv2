const { API_CONFIG } = require('../config/api');

// Define missing types
export interface Suggestion {
  category: string;
  title: string;
  content: string;
}

export interface ItineraryDay {
  day: number;
  activities: Activity[];
}

export type GrokMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
  id: string;
  timestamp: Date;
  type?: 'itinerary_update' | 'context_update' | 'suggestion' | 'tip';
  metadata?: {
    itinerary?: TravelContext['itinerary'];
    suggestions?: TravelContext['suggestions'];
    tips?: TravelContext['tips'];
  };
};

export type GrokResponse = {
  choices: {
    message: {
      content: string;
      role: string;
      id?: string;
    };
    id: string;
  }[];
  id: string;
};

interface Activity {
  time: string;
  activity: string;
  icon: string;
}

export interface TravelContext {
  destination?: string;
  dates?: {
    startDate: string;
    endDate: string;
  };
  duration?: number;
  id?: string;
  tips?: string[];
  suggestions?: Suggestion[];
  preferences?: {
    budget?: string;
    currency?: string;
    interests?: string[];
    accommodation?: string;
  };
  numberOfTravelers?: number;
  itinerary?: ItineraryDay[];
}

interface GrokAnalysis {
  destination?: string;
  dates?: string;
  budget?: string;
  interests?: string[];
  accommodation?: string;
  tips?: string[];
  numberOfTravelers?: number | string;
}

class GrokService {
  private messages: GrokMessage[] = [
    {
      role: 'system',
      content: `You are an AI travel planning assistant. Your role is to help users plan their perfect trip.
      You should:
      - Ask relevant questions about their travel preferences
      - Provide personalized recommendations
      - Help with itinerary planning
      - Consider budget constraints
      - Suggest activities based on interests
      - Provide practical travel tips
      
      When providing travel information, always include a structured data section at the end of your response using this format:
      [DATA]
      {
        "destination": "city or country name",
        "dates": { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" },
        "budget": "amount in USD",
        "interests": ["interest1", "interest2"],
        "accommodation": "preferred type",
        "numberOfTravelers": number,
        "duration": "length of stay"
      }
      
      When providing travel tips (general advice like "Check visa requirements", "Pack light", etc.), 
      add them after your main response using the format:
      [TIPS]
      - First tip
      - Second tip
      - Third tip
      
      When providing activity suggestions or specific recommendations, add them after tips using the format:
      [SUGGESTIONS]
      ** Category Name **
      - Title: Description
      - Another Title: Another description
      
      IMPORTANT: When the user asks for an itinerary or daily schedule, provide the itinerary data in JSON format at the end of your response:
      [ITINERARY]
      \`\`\`json
      [
        {
          "day": 1,
          "activities": [
            {
              "time": "09:00",
              "activity": "Activity name",
              "icon": "appropriate_icon"
            }
          ]
        }
      ]
      \`\`\`
      
      Keep your responses concise, friendly, and focused on travel planning.`,
      id: 'msg_system_001',
      timestamp: new Date(),
    }
  ];

  private currentConversationId: string | null = null;
  private lastAssistantResponseId: string | null = null;

  private context: TravelContext = {};
  private messageCounter = 0;

  constructor() {
    // Initialize any other necessary properties
  }

  private updateContext(userMessage: string) {
    const lowerMessage = userMessage.toLowerCase();
    
    // Extract destination
    if (lowerMessage.includes('go to') || lowerMessage.includes('visit') || lowerMessage.includes('travel to')) {
      const destinationMatch = userMessage.match(/(?:go to|visit|travel to)\s+([^,.!?]+)/i);
      if (destinationMatch) {
        this.context.destination = destinationMatch[1].trim();
      }
    }

    // Extract dates
    if (lowerMessage.includes('in') || lowerMessage.includes('during') || lowerMessage.includes('on')) {
      const dateMatch = userMessage.match(/(?:in|during|on)\s+([^,.!?]+)/i);
      if (dateMatch) {
        this.context.dates = { 
          startDate: dateMatch[1].trim(),
          endDate: dateMatch[1].trim() // Use same date for both if only one provided
        };
      }
    }

    // Extract budget
    if (lowerMessage.includes('budget') || lowerMessage.includes('cost') || lowerMessage.includes('price')) {
      const budgetMatch = userMessage.match(/(\d+(?:,\d+)*(?:\.\d+)?)\s*(?:dollars|usd|\$)?/i);
      if (budgetMatch) {
        this.context.preferences = {
          ...this.context.preferences,
          budget: budgetMatch[1]
        };
      }
    }

    // Extract duration
    if (lowerMessage.includes('for') || lowerMessage.includes('stay')) {
      const durationMatch = userMessage.match(/(?:for|stay)\s+([^,.!?]+)/i);
      if (durationMatch) {
        // Try to extract a number from the duration string
        const numberMatch = durationMatch[1].match(/(\d+)/);
        if (numberMatch) {
          this.context.duration = parseInt(numberMatch[1], 10);
        }
      }
    }

    // Extract interests
    const interests = ['beach', 'mountain', 'city', 'culture', 'food', 'adventure', 'relaxation', 'shopping'];
    const foundInterests = interests.filter(interest => lowerMessage.includes(interest));
    if (foundInterests.length > 0) {
      this.context.preferences = {
        ...this.context.preferences,
        interests: foundInterests
      };
    }
  }

  private getFallbackResponse(userMessage: string, currentContext: TravelContext): string {
    const lowerMessage = userMessage.toLowerCase();

    // Use the provided currentContext
    if (currentContext.destination) {
      if (!currentContext.dates) {
        return `🌟 ${currentContext.destination} is a great choice!\n📅 When are you planning to visit?`;
      }
      if (!currentContext.preferences?.budget) {
        return `✨ For ${currentContext.destination} ${currentContext.dates}:\n💰 What's your budget?`;
      }
      if (!currentContext.preferences?.interests || currentContext.preferences.interests.length === 0) {
        return `🎯 For ${currentContext.destination} ($${currentContext.preferences.budget}):\nWhat interests you most?\n• Adventure\n• Culture\n• Relaxation\n• Food\n• Shopping`;
      }
      // Handle interests which can be string or string[]
      const formattedInterests = Array.isArray(currentContext.preferences.interests) 
                                  ? currentContext.preferences.interests.join(', ') 
                                  : currentContext.preferences.interests;

      // Handle tips which can be string or string[]
      const formattedTips = Array.isArray(currentContext.tips)
                              ? currentContext.tips.join(', ')
                              : currentContext.tips;

      let planDetails = `📅 ${currentContext.dates}\n💰 $${currentContext.preferences.budget}`; // Assuming budget is a string with $
      if(formattedInterests) planDetails += `\n🎯 ${formattedInterests}`;
      if(formattedTips) planDetails += `\n💡 ${formattedTips}`;

      return `📋 ${currentContext.destination} Plan:\n${planDetails}\n\nNeed specific recommendations?`;
    }

    // Initial conversation patterns (can also use currentContext here if relevant)
    if (lowerMessage.includes('hello') || lowerMessage.includes('hi')) {
      return "👋 Hi! I'm your travel assistant.\n🌍 Where would you like to go?";
    }
    
    if (lowerMessage.includes('where') || lowerMessage.includes('destination')) {
      return "🌍 Looking for:\n• Beach 🏖️\n• Mountain ⛰️\n• City 🏙️\n• Culture 🏛️\n• Food 🍷";
    }
    
    if (lowerMessage.includes('budget') || lowerMessage.includes('cost') || lowerMessage.includes('price')) {
      // If budget is already in context, maybe acknowledge it?
      if (currentContext.preferences?.budget) {
         return `💰 You mentioned your budget is ${currentContext.preferences.budget}. What specifically would you like to know about costs?`;
      }
      return "💰 What's your budget range?";
    }
    
    if (lowerMessage.includes('when') || lowerMessage.includes('time') || lowerMessage.includes('date')) {
       // If dates are already in context, maybe acknowledge it?
       if (currentContext.dates) {
          return `📅 You mentioned you're planning for ${currentContext.dates}. How can I help with dates?`;
       }
      return "📅 When are you planning to travel?";
    }
    
    if (lowerMessage.includes('how') || lowerMessage.includes('plan')) {
      // Use current context to give a more tailored plan summary
      let planSummary = "📋 Let's start:";
      if (currentContext.destination) planSummary += `\n1️⃣ Destination: ${currentContext.destination}`; else planSummary += `\n1️⃣ Where?`;
      if (currentContext.dates) planSummary += `\n2️⃣ Dates: ${currentContext.dates}`; else planSummary += `\n2️⃣ When?`;
      if (currentContext.preferences?.budget) planSummary += `\n3️⃣ Budget: ${currentContext.preferences.budget}`; else planSummary += `\n3️⃣ Budget?`;
      if (currentContext.preferences?.interests && currentContext.preferences.interests.length > 0) planSummary += `\n4️⃣ Interests: ${currentContext.preferences.interests.join(', ')}`;

      return planSummary;
    }
    
    // Default response, potentially using current context
    if (Object.keys(currentContext).length > 0) {
        // If context exists, maybe ask a follow-up based on what's missing
        if (!currentContext.destination) return "🌍 Where would you like to go?";
        if (!currentContext.dates) return `📅 When are you planning your trip to ${currentContext.destination}?`;
        if (!currentContext.preferences?.budget) return `💰 What's your budget for ${currentContext.destination} from ${currentContext.dates}?`;
         if (!currentContext.preferences?.interests || currentContext.preferences.interests.length === 0) return `🎯 What kind of activities interest you in ${currentContext.destination}?`;
    }

    // Generic default if no context or patterns match
    return "🌍 Where would you like to go?";
  }

  private parseStructuredData(response: string): { data?: any, tips?: string[], suggestions?: any[] } {
    const result: { data?: any, tips?: string[], suggestions?: any[] } = {};
    
    try {
      // Extract DATA section
      const dataMatch = response.match(/\[DATA\]\s*({[\s\S]*?})/);
      if (dataMatch) {
        try {
          result.data = JSON.parse(dataMatch[1]);
        } catch (e) {
          console.log('Error parsing DATA section:', e);
        }
      }

      // Extract TIPS section
      const tipsMatch = response.match(/\[TIPS\]\s*((?:- .*\n?)*)/);
      if (tipsMatch) {
        result.tips = tipsMatch[1]
          .split('\n')
          .map(tip => tip.replace(/^- /, '').trim())
          .filter(tip => tip.length > 0);
      }

      // Extract SUGGESTIONS section
      const suggestionsMatch = response.match(/\[SUGGESTIONS\]\s*([\s\S]*?)(?=\[|$)/);
      if (suggestionsMatch) {
        const suggestionsText = suggestionsMatch[1];
        const categories = suggestionsText.split('**').filter(Boolean);
        
        result.suggestions = categories.map(category => {
          const [categoryName, ...items] = category.split('\n').filter(Boolean);
          return {
            category: categoryName.trim(),
            items: items
              .map(item => {
                const [title, ...description] = item.split(':');
                return {
                  title: title.replace(/^- /, '').trim(),
                  description: description.join(':').trim()
                };
              })
              .filter(item => item.title)
          };
        });
      }
    } catch (error) {
      console.error('Error parsing structured sections:', error);
    }

    return result;
  }

  private updateContextFromResponse(response: string, currentContext: TravelContext) {
    try {
      // Extract DATA section with more robust regex
      const dataMatch = response.match(/\[DATA\][\s\n]*(\{[\s\S]*?\})[\s\n]*(?=\[|$)/);
      if (dataMatch) {
        try {
          const structuredData = JSON.parse(dataMatch[1]);
          console.log('Parsed structured data:', structuredData);

          // Update context with the parsed data, preserving existing values
          this.context = {
            ...this.context,
            destination: structuredData.destination || this.context.destination,
            // Properly handle dates object
            dates: {
              ...this.context.dates,
              startDate: structuredData.dates?.startDate || this.context.dates?.startDate,
              endDate: structuredData.dates?.endDate || this.context.dates?.endDate
            },
            duration: structuredData.duration || this.context.duration,
            numberOfTravelers: structuredData.numberOfTravelers || this.context.numberOfTravelers,
            preferences: {
              ...this.context.preferences,
              budget: structuredData.budget || this.context.preferences?.budget,
              interests: structuredData.interests || this.context.preferences?.interests,
              accommodation: structuredData.accommodation || this.context.preferences?.accommodation
            }
          };
        } catch (error) {
          console.error('Error parsing DATA section:', error);
          // Don't throw, continue processing other sections
        }
      }

      // Extract TIPS section
      const tipsMatch = response.match(/\[TIPS\]([\s\S]*?)(?=\[SUGGESTIONS\]|$)/);
      if (tipsMatch) {
        const tips = tipsMatch[1]
          .split('\n')
          .filter(line => line.trim().startsWith('-'))
          .map(tip => tip.replace(/^-\s*/, '').trim());
        
        if (tips.length > 0) {
          this.context.tips = [...new Set([...(this.context.tips || []), ...tips])];
        }
      }

      // Extract SUGGESTIONS section
      const suggestionsMatch = response.match(/\[SUGGESTIONS\]([\s\S]*?)$/);
      if (suggestionsMatch) {
        const suggestions: any[] = [];
        let currentCategory = '';
        
        suggestionsMatch[1].split('\n').forEach(line => {
          line = line.trim();
          if (line.startsWith('**') && line.endsWith('**')) {
            currentCategory = line.replace(/\*\*/g, '').trim();
          } else if (line.startsWith('-')) {
            const [title, ...descParts] = line.substring(1).split(':');
            const description = descParts.join(':').trim();
            if (title && description) {
              suggestions.push({
                category: currentCategory,
                title: title.trim(),
                content: description
              });
            }
          }
        });

        if (suggestions.length > 0) {
          this.context.suggestions = suggestions;
        }
      }

      console.log('Updated context after parsing response:', this.context);
    } catch (error) {
      console.error('Error parsing structured data:', error);
    }
  }

  async sendMessage(userMessage: string, currentContext: TravelContext): Promise<string> {
    if (!API_CONFIG.GITHUB_TOKEN) {
      console.error('GitHub token is not configured.');
      return this.getFallbackResponse(userMessage, currentContext);
    }

    console.log('Current context before sending:', currentContext);

    // Create a new messages array starting with the system message
    const baseSystemMessage = `You are an AI travel planning assistant. Your role is to help users plan their perfect trip.
      You should:
      - Ask relevant questions about their travel preferences
      - Provide personalized recommendations
      - Help with itinerary planning
      - Consider budget constraints
      - Suggest activities based on interests
      - Provide practical travel tips
      
      When providing travel information, always include a structured data section at the end of your response using this format:
      [DATA]
      {
        "destination": "city or country name",
        "dates": { "startDate": "YYYY-MM-DD", "endDate": "YYYY-MM-DD" },
        "budget": "amount in USD",
        "interests": ["interest1", "interest2"],
        "accommodation": "preferred type",
        "numberOfTravelers": number,
        "duration": "length of stay"
      }
      
      When providing travel tips (general advice like "Check visa requirements", "Pack light", etc.), 
      add them after your main response using the format:
      [TIPS]
      - First tip
      - Second tip
      - Third tip
      
      When providing activity suggestions or specific recommendations, add them after tips using the format:
      [SUGGESTIONS]
      ** Category Name **
      - Title: Description
      - Another Title: Another description
      
      IMPORTANT: When the user asks for an itinerary or daily schedule, provide the itinerary data in JSON format at the end of your response:
      [ITINERARY]
      \`\`\`json
      [
        {
          "day": 1,
          "activities": [
            {
              "time": "09:00",
              "activity": "Activity name",
              "icon": "appropriate_icon"
            }
          ]
        }
      ]
      \`\`\`
      
      Keep your responses concise, friendly, and focused on travel planning.`;

    // Add context information if available
    let contextInfo = '';
    if (currentContext && Object.keys(currentContext).length > 0) {
      // Format dates properly for the context
      const formattedDates = currentContext.dates ? {
        startDate: currentContext.dates.startDate || 'Not specified',
        endDate: currentContext.dates.endDate || 'Not specified'
      } : {
        startDate: 'Not specified',
        endDate: 'Not specified'
      };

      contextInfo = `\n\nCurrent Trip Context:
      {
        "destination": "${currentContext.destination || 'Not specified'}",
        "duration": "${currentContext.duration || 'Not specified'}",
        "numberOfTravelers": ${currentContext.numberOfTravelers || 'Not specified'},
        "dates": ${JSON.stringify(formattedDates, null, 2)},
        "preferences": {
          "budget": "${currentContext.preferences?.budget || 'Not specified'}",
          "interests": ${JSON.stringify(currentContext.preferences?.interests || [])},
          "accommodation": "${currentContext.preferences?.accommodation || 'Not specified'}"
        }
      }

      Important Instructions:
      1. Use this context to provide personalized recommendations
      2. DO NOT ask for information that is already provided (unless marked as "Not specified")
      3. If a field shows a specific value, use that information in your response
      4. Only ask for missing information (marked as "Not specified")
      5. Provide specific recommendations based on the known preferences
      6. When dates are marked as "Not specified", ask for them to better plan the trip
      7. When dates are provided, use them to give season-appropriate recommendations`;
    }

    // Combine base message and context
    const fullSystemMessage = baseSystemMessage + contextInfo;

    // Create the messages array with the updated system message
    const messagesToSend: GrokMessage[] = [
      {
        role: 'system' as const,
        content: fullSystemMessage,
        id: 'msg_system_001',
        timestamp: new Date()
      },
      ...this.messages.slice(1) // Keep all existing messages except the old system message
    ];

    // Add the new user message
    messagesToSend.push({
      role: 'user' as const,
      content: userMessage,
      id: `msg_grok_user_${this.generateId()}`,
      timestamp: new Date()
    });

    // Update the instance messages
    this.messages = messagesToSend;

    try {
      console.log('Sending request to Grok API...');
      console.log('Messages being sent:', JSON.stringify(messagesToSend, null, 2));
      const startTime = Date.now();
      
      // Create a timeout promise
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('API request timed out')), API_CONFIG.TIMEOUT);
      });

      // Send request to API
      const fetchPromise = fetch(API_CONFIG.ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${API_CONFIG.GITHUB_TOKEN}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Accept': 'application/vnd.github+json',
        },
        body: JSON.stringify({
          model: API_CONFIG.MODEL,
          messages: messagesToSend.map(msg => ({
            role: msg.role,
            content: msg.content
          }))
        })
      });

      // Race between the fetch and the timeout
      const response = await Promise.race([fetchPromise, timeoutPromise]) as Response;
      
      const endTime = Date.now();
      console.log(`Grok API call took ${endTime - startTime}ms`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API request failed with status:', response.status);
        console.error('Response headers:', Object.fromEntries(response.headers.entries()));
        console.error('Error details:', errorData);
        
        // Check for RateLimitReached error
        if (errorData?.error?.code === 'RateLimitReached') {
          console.error('Rate limit reached. Retry after:', errorData.error.details); // Log the specific error details
          return "🚫 It looks like we've hit a rate limit for the AI service. Please wait 24 hours before sending more messages.";
        } else {
          // For other API errors, return the fallback response
          return this.getFallbackResponse(userMessage, currentContext);
        }
      }

      const responseData = await response.json();
      console.log('Raw API response:', responseData);
      
      if (!responseData?.choices?.[0]?.message?.content) {
        console.error('Invalid response format from API:', responseData);
        return this.getFallbackResponse(userMessage, currentContext);
      }

      const assistantMessageContent = responseData.choices[0].message.content;
      console.log('Successfully processed API response:', assistantMessageContent);

      // Update context with structured data from response
      this.updateContextFromResponse(assistantMessageContent, currentContext);

      // Add assistant's response to conversation history
      this.messages.push({
        role: 'assistant',
        content: assistantMessageContent,
        id: `msg_grok_assistant_${this.generateId()}`,
        timestamp: new Date(),
      });

      return assistantMessageContent;
    } catch (error) {
      console.error('Grok API Error:', error);
      if (error instanceof Error) {
        if (error.message === 'API request timed out') {
          console.error('Request timed out after', API_CONFIG.TIMEOUT, 'ms');
        } else {
          console.error('Error details:', error.message);
        }
      }
      // Remove the last user message since it failed
      this.messages.pop();
      return this.getFallbackResponse(userMessage, currentContext);
    }
  }

  clearConversation() {
    // Keep only the system message
    this.messages = [this.messages[0]];
    // Reset context
    this.context = {};
    // Also reset conversation IDs
    this.currentConversationId = null;
    this.lastAssistantResponseId = null;
  }

  // Helper to generate unique IDs
  private generateId(): string {
    this.messageCounter += 1;
    return `${this.messageCounter}_${Date.now()}`;
  }

  // New method to get current messages
  public getMessages(): GrokMessage[] {
    return this.messages;
  }

  // New method to get current context
  public getContext(): TravelContext {
    return this.context;
  }

  // New method to set the conversation state
  public setConversation(messages: GrokMessage[], context: TravelContext) {
    // Keep the original system message structure but update with new context
    const baseSystemMessage = this.messages[0].content.split('Current Trip Context:')[0].trim();
    let contextInfo = '';
    
    if (context && Object.keys(context).length > 0) {
      // Format dates properly
      const formattedDates = context.dates ? {
        startDate: context.dates.startDate || 'Not specified',
        endDate: context.dates.endDate || 'Not specified'
      } : {
        startDate: 'Not specified',
        endDate: 'Not specified'
      };

      contextInfo = `\nCurrent Trip Context:
      {
        "destination": "${context.destination || 'Not specified'}",
        "duration": "${context.duration || 'Not specified'}",
        "numberOfTravelers": ${context.numberOfTravelers || 'Not specified'},
        "dates": ${JSON.stringify(formattedDates, null, 2)},
        "preferences": {
          "budget": "${context.preferences?.budget || 'Not specified'}",
          "interests": ${JSON.stringify(context.preferences?.interests || [])},
          "accommodation": "${context.preferences?.accommodation || 'Not specified'}"
        }
      }

      Please consider this context when providing recommendations and avoid asking for information that has already been provided.
      If any field is marked as "Not specified", you may ask for it. Otherwise, use the provided information to give relevant recommendations.`;
    }

    // Create the full system message
    const systemMessage = baseSystemMessage + contextInfo;

    // Set the messages array with the updated system message
    this.messages = [
      {
        role: 'system',
        content: systemMessage,
        id: 'msg_system_001',
        timestamp: new Date(),
      },
      ...messages.filter(msg => msg.role === 'user' || msg.role === 'assistant')
    ];

    // Update the context, preserving the dates structure
    this.context = {
      ...context,
      dates: context.dates ? {
        startDate: context.dates.startDate,
        endDate: context.dates.endDate
      } : undefined
    };
    
    // Reset conversation IDs as we're managing history through messages
    this.currentConversationId = null;
    this.lastAssistantResponseId = null;
    
    console.log('GrokService conversation state set with updated context.');
  }

  async analyzeMessage(message: string, currentContext: any): Promise<GrokAnalysis | null> {
    try {
      const analysis: GrokAnalysis = {};
      const lowerMessage = message.toLowerCase();

      // Extract destination
      const destinationPatterns = [
        /going to ([^,.!?]+)/i,
        /visit(?:ing)? ([^,.!?]+)/i,
        /travel(?:ing)? to ([^,.!?]+)/i,
        /planning to go to ([^,.!?]+)/i,
        /headed to ([^,.!?]+)/i
      ];

      for (const pattern of destinationPatterns) {
        const match = message.match(pattern);
        if (match) {
          analysis.destination = match[1].trim();
          break;
        }
      }

      // Extract dates
      const datePatterns = [
        /from (\d{4}-\d{2}-\d{2}) to (\d{4}-\d{2}-\d{2})/i,
        /between (\d{4}-\d{2}-\d{2}) and (\d{4}-\d{2}-\d{2})/i,
        /(\d{4}-\d{2}-\d{2}) until (\d{4}-\d{2}-\d{2})/i,
        /(\d{4}-\d{2}-\d{2}) through (\d{4}-\d{2}-\d{2})/i
      ];

      for (const pattern of datePatterns) {
        const match = message.match(pattern);
        if (match) {
          analysis.dates = `${match[1]} - ${match[2]}`;
          break;
        }
      }

      // Extract budget
      const budgetPatterns = [
        /\$(\d+(?:,\d+)*(?:\.\d+)?)/i,
        /budget (?:of|is) (\$?\d+(?:,\d+)*(?:\.\d+)?)/i,
        /spending (\$?\d+(?:,\d+)*(?:\.\d+)?)/i,
        /cost(?:ing)? (\$?\d+(?:,\d+)*(?:\.\d+)?)/i
      ];

      for (const pattern of budgetPatterns) {
        const match = message.match(pattern);
        if (match) {
          const amount = match[1].replace(/,/g, '');
          analysis.budget = `$${amount}`;
          break;
        }
      }

      // Extract interests
      const interestKeywords = [
        'beach', 'mountains', 'hiking', 'culture', 'history', 'food', 'shopping',
        'adventure', 'relaxation', 'nightlife', 'nature', 'art', 'music', 'sports',
        'photography', 'architecture', 'museums', 'parks', 'theater', 'festivals'
      ];

      const foundInterests = interestKeywords.filter(keyword => 
        lowerMessage.includes(keyword.toLowerCase())
      );

      if (foundInterests.length > 0) {
        analysis.interests = foundInterests;
      }

      // Extract accommodation
      const accommodationPatterns = [
        /staying at ([^,.!?]+)/i,
        /accommodation (?:at|in) ([^,.!?]+)/i,
        /hotel (?:at|in) ([^,.!?]+)/i,
        /lodging (?:at|in) ([^,.!?]+)/i
      ];

      for (const pattern of accommodationPatterns) {
        const match = message.match(pattern);
        if (match) {
          analysis.accommodation = match[1].trim();
          break;
        }
      }

      // Extract tips
      const tipPatterns = [
        /tip(?:s)?: ([^,.!?]+)/i,
        /suggestion(?:s)?: ([^,.!?]+)/i,
        /recommendation(?:s)?: ([^,.!?]+)/i,
        /advice: ([^,.!?]+)/i
      ];

      for (const pattern of tipPatterns) {
        const match = message.match(pattern);
        if (match) {
          analysis.tips = match[1].split(',').map(t => t.trim()).filter(t => t !== ''); // Ensure tips are an array
          break;
        }
      }

      return Object.keys(analysis).length > 0 ? analysis : null;
    } catch (error) {
      console.error('Error analyzing message:', error);
      return null;
    }
  }
}

export const grokService = new GrokService(); 

// Helper function to extract itinerary updates from AI responses
export const extractItineraryFromResponse = (response: string): TravelContext['itinerary'] | undefined => {
  try {
    // Look for itinerary data in a JSON block
    const match = response.match(/```json\n([\s\S]*?)\n```/);
    if (match) {
      const jsonData = JSON.parse(match[1]);
      if (Array.isArray(jsonData)) {
        return jsonData.map((day: any) => ({
          day: day.day,
          activities: day.activities.map((activity: any) => ({
            time: activity.time,
            activity: activity.activity,
            icon: activity.icon || getActivityIcon(activity.activity),
          })),
        }));
      }
    }
    return undefined;
  } catch (error) {
    console.error('Error extracting itinerary:', error);
    return undefined;
  }
};

// Helper function to get an appropriate icon for an activity
export const getActivityIcon = (activity: string): string => {
  const lowerActivity = activity.toLowerCase();
  
  // Transportation
  if (lowerActivity.includes('flight') || lowerActivity.includes('airport')) return '✈️';
  if (lowerActivity.includes('train') || lowerActivity.includes('rail')) return '🚂';
  if (lowerActivity.includes('bus') || lowerActivity.includes('coach')) return '🚌';
  if (lowerActivity.includes('taxi') || lowerActivity.includes('car')) return '🚗';
  if (lowerActivity.includes('ferry') || lowerActivity.includes('boat')) return '⛴️';
  
  // Accommodation
  if (lowerActivity.includes('hotel') || lowerActivity.includes('check-in') || lowerActivity.includes('check-out')) return '🏨';
  
  // Food & Drink
  if (lowerActivity.includes('breakfast')) return '☕';
  if (lowerActivity.includes('lunch') || lowerActivity.includes('dinner') || lowerActivity.includes('restaurant')) return '🍽️';
  if (lowerActivity.includes('cafe') || lowerActivity.includes('coffee')) return '☕';
  if (lowerActivity.includes('bar') || lowerActivity.includes('drink')) return '🍷';
  
  // Activities
  if (lowerActivity.includes('tour') || lowerActivity.includes('sightseeing') || lowerActivity.includes('walking')) return '🚶';
  if (lowerActivity.includes('museum')) return '🏛️';
  if (lowerActivity.includes('shopping') || lowerActivity.includes('market')) return '🏪';
  if (lowerActivity.includes('art') || lowerActivity.includes('gallery')) return '🎨';
  if (lowerActivity.includes('theater') || lowerActivity.includes('show')) return '🎭';
  if (lowerActivity.includes('beach')) return '🏖️';
  if (lowerActivity.includes('hiking') || lowerActivity.includes('mountain')) return '⛰️';
  if (lowerActivity.includes('temple') || lowerActivity.includes('shrine')) return '🏺';
  if (lowerActivity.includes('park') || lowerActivity.includes('garden')) return '🌳';
  if (lowerActivity.includes('festival') || lowerActivity.includes('carnival')) return '🎪';
  if (lowerActivity.includes('amusement') || lowerActivity.includes('theme park')) return '🎢';
  if (lowerActivity.includes('swimming') || lowerActivity.includes('water')) return '🌊';
  
  // Default
  return '📍';
};

// Helper function to merge itinerary updates with existing itinerary
export const mergeItineraries = (
  existing: TravelContext['itinerary'] = [],
  updates: TravelContext['itinerary'] = []
): TravelContext['itinerary'] => {
  const merged = [...existing];

  updates.forEach(updateDay => {
    const existingDayIndex = merged.findIndex(day => day.day === updateDay.day);
    
    if (existingDayIndex >= 0) {
      // Merge activities for existing day
      const existingActivities = merged[existingDayIndex].activities;
      const newActivities = updateDay.activities;
      
      // Add new activities and sort by time
      merged[existingDayIndex].activities = [...existingActivities, ...newActivities]
        .reduce((unique: Activity[], activity: Activity) => {
          const key = `${activity.time}-${activity.activity}`;
          return unique.some(a => `${a.time}-${a.activity}` === key)
            ? unique
            : [...unique, activity];
        }, [] as Activity[])
        .sort((a: Activity, b: Activity) => {
          const timeA = a.time.split(':').map(Number);
          const timeB = b.time.split(':').map(Number);
          return (timeA[0] * 60 + timeA[1]) - (timeB[0] * 60 + timeB[1]);
        });
    } else {
      // Add new day
      merged.push(updateDay);
    }
  });

  // Sort days
  return merged.sort((a, b) => a.day - b.day);
}; 