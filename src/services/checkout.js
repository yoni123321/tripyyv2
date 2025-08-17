const { CheckoutApi, CheckoutConfiguration } = require('checkout-sdk-node');

// Configure Checkout.com
const configuration = new CheckoutConfiguration({
  secretKey: process.env.CHECKOUT_SECRET_KEY || 'sk_test_...',
  publicKey: process.env.CHECKOUT_PUBLIC_KEY || 'pk_test_...',
  environment: 'sandbox', // Change to 'production' for live
});

const checkoutApi = new CheckoutApi(configuration);

// Create payment session (for hosted checkout)
const createPaymentSession = async (amount, currency = 'USD') => {
  try {
    const sessionRequest = {
      amount: amount * 100, // Convert to cents
      currency: currency,
      reference: `tripyy_subscription_${Date.now()}`,
      description: 'Tripyy Subscription',
      success_url: 'tripyy://payment/success',
      failure_url: 'tripyy://payment/failure',
      cancel_url: 'tripyy://payment/cancel',
      payment_method_types: ['card', 'paypal', 'apple_pay', 'google_pay'],
      capture_method: 'automatic',
    };

    const session = await checkoutApi.sessions.create(sessionRequest);
    return session;
  } catch (error) {
    console.error('Error creating Checkout.com session:', error);
    throw error;
  }
};

// Get payment details
const getPayment = async (paymentId) => {
  try {
    const payment = await checkoutApi.payments.get(paymentId);
    return payment;
  } catch (error) {
    console.error('Error getting Checkout.com payment:', error);
    throw error;
  }
};

// Create payment (for direct API calls)
const createPayment = async (amount, currency = 'USD', paymentMethod = 'card') => {
  try {
    const paymentRequest = {
      amount: amount * 100, // Convert to cents
      currency: currency,
      payment_type: 'Regular',
      reference: `tripyy_subscription_${Date.now()}`,
      description: 'Tripyy Subscription Payment',
      capture: true, // Auto-capture the payment
      success_url: 'tripyy://payment/success',
      failure_url: 'tripyy://payment/failure',
      cancel_url: 'tripyy://payment/cancel',
    };

    // Add payment method specific data
    if (paymentMethod === 'paypal') {
      paymentRequest.payment_method = {
        type: 'paypal',
      };
    } else if (paymentMethod === 'apple_pay') {
      paymentRequest.payment_method = {
        type: 'apple_pay',
      };
    } else if (paymentMethod === 'google_pay') {
      paymentRequest.payment_method = {
        type: 'google_pay',
      };
    }

    const payment = await checkoutApi.payments.create(paymentRequest);
    return payment;
  } catch (error) {
    console.error('Error creating Checkout.com payment:', error);
    throw error;
  }
};

module.exports = {
  createPayment,
  getPayment,
  createPaymentSession,
}; 