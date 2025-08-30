// Define the types locally to avoid import issues
interface TravelContext {
  destination: string;
  dates: {
    start: Date;
    end: Date;
  };
  preferences: any;
  travelerProfile: any;
  itinerary: any[];
  budget: {
    total: number;
    spent: number;
    currency: string;
  };
  tips: Array<{title: string, text: string, source?: 'agent' | 'manual'}>;
  suggestions?: Array<{title: string, text: string, source?: 'agent' | 'manual'}>;
  llmConfig: any;
  savedAgents: any[];
  currentTripId?: string;
  accountType: 'traveler' | 'pro' | 'creator';
}

interface AIResponse {
  message: {
    content: string;
  };
  extractedData?: {
    tips?: string[];
    suggestions?: string[];
    waitTime?: number;
    [key: string]: any;
  };
}

interface ContextUpdate {
  itinerary?: any[];
  budget?: any;
  preferences?: any;
  destination?: string;
  dates?: any;
}

class AIAgent {
  private contextUpdateCallback?: (updates: ContextUpdate) => void;

  setContextUpdateCallback(callback: (updates: ContextUpdate) => void) {
    this.contextUpdateCallback = callback;
  }

  async processMessage(message: string, context: TravelContext): Promise<AIResponse> {
    // Basic AI response logic
    const response: AIResponse = {
      message: {
        content: `I received your message: "${message}". I'm here to help with your travel planning!`
      },
      extractedData: {
        tips: [],
        suggestions: []
      }
    };
    
    // Example context update
    if (this.contextUpdateCallback) {
      this.contextUpdateCallback({
        destination: context.destination,
        budget: context.budget,
      });
    }

    return response;
  }

  async generateItinerary(context: TravelContext): Promise<any[]> {
    // Basic itinerary generation
    return [
      {
        day: 1,
        activities: [
          {
            id: 'activity_1_1',
            title: 'Welcome to your destination',
            description: 'Start your journey with a warm welcome',
            startTime: '09:00',
            endTime: '10:00',
            location: context.destination || 'Your destination',
            type: 'arrival',
          }
        ]
      }
    ];
  }
}

module.exports = { aiAgent: new AIAgent() }; 