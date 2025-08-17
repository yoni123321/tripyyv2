const paypal = require('@paypal/paypal-server-sdk');

// Configure PayPal environment
const environment = process.env.PAYPAL_MODE === 'live' 
  ? new paypal.core.LiveEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET)
  : new paypal.core.SandboxEnvironment(process.env.PAYPAL_CLIENT_ID, process.env.PAYPAL_CLIENT_SECRET);

const client = new paypal.core.PayPalHttpClient(environment);

// Create PayPal order (for direct PayPal payments)
const createPayPalOrder = async (amount, currency = 'USD') => {
  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toString()
        },
        description: 'Tripyy Subscription'
      }],
      application_context: {
        return_url: 'tripyy://payment/success',
        cancel_url: 'tripyy://payment/cancel'
      }
    });

    const order = await client.execute(request);
    return order.result;
  } catch (error) {
    console.error('PayPal order creation error:', error);
    throw error;
  }
};

// Create PayPal order for Apple Pay
const createApplePayOrder = async (amount, currency = 'USD') => {
  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toString()
        },
        description: 'Tripyy Subscription (Apple Pay)'
      }],
      application_context: {
        return_url: 'tripyy://payment/success',
        cancel_url: 'tripyy://payment/cancel',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
        }
      }
    });

    const order = await client.execute(request);
    return order.result;
  } catch (error) {
    console.error('Apple Pay PayPal order creation error:', error);
    throw error;
  }
};

// Create PayPal order for Google Pay
const createGooglePayOrder = async (amount, currency = 'USD') => {
  try {
    const request = new paypal.orders.OrdersCreateRequest();
    request.prefer("return=representation");
    request.requestBody({
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: currency,
          value: amount.toString()
        },
        description: 'Tripyy Subscription (Google Pay)'
      }],
      application_context: {
        return_url: 'tripyy://payment/success',
        cancel_url: 'tripyy://payment/cancel',
        payment_method: {
          payer_selected: 'PAYPAL',
          payee_preferred: 'IMMEDIATE_PAYMENT_REQUIRED'
        }
      }
    });

    const order = await client.execute(request);
    return order.result;
  } catch (error) {
    console.error('Google Pay PayPal order creation error:', error);
    throw error;
  }
};

// Capture PayPal payment
const capturePayPalPayment = async (orderId) => {
  try {
    const request = new paypal.orders.OrdersCaptureRequest(orderId);
    request.requestBody({});

    const capture = await client.execute(request);
    return capture.result;
  } catch (error) {
    console.error('PayPal payment capture error:', error);
    throw error;
  }
};

// Get PayPal order details
const getPayPalOrder = async (orderId) => {
  try {
    const request = new paypal.orders.OrdersGetRequest(orderId);
    const order = await client.execute(request);
    return order.result;
  } catch (error) {
    console.error('PayPal order retrieval error:', error);
    throw error;
  }
};

module.exports = {
  createPayPalOrder,
  createApplePayOrder,
  createGooglePayOrder,
  capturePayPalPayment,
  getPayPalOrder,
}; 