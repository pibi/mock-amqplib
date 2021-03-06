const queues = {};
const exchanges = {};
const eventListeners = [];

const createQueue = () => {
  let messages = [];
  let subscriber = null;

  return {
    add: item => {
      if (subscriber) {
        subscriber(item);
      } else {
        messages.push(item);
      }
    },
    get: () => messages.shift() || false,
    addConsumer: consumer => {
      messages.forEach(item => consumer(item));
      messages = [];
      subscriber = consumer;
    },
    stopConsume: () => (subscriber = null),
    getMessageCount: () => messages.length,
    purge: () => (messages = [])
  };
};

const createHeadersExchange = () => {
  const bindings = [];
  return {
    bindQueue: (queueName, pattern, options) => {
      bindings.push({
        targetQueue: queueName,
        options
      });
    },
    getTargetQueue: (routingKey, headers) => {
      const isMatching = (binding, headers) =>
        Object.keys(binding.options).every(key => binding.options[key] === headers[key]);
      const matcingBinding = bindings.find(binding => isMatching(binding, headers));
      return matcingBinding.targetQueue;
    }
  };
};

const createChannel = async () => ({
  on: (eventName, listener) => {
    eventListeners.push({ eventName, listener });
  },
  emit: emittedEventName => {
    eventListeners.forEach(({ eventName, listener }) => {
      if (eventName === emittedEventName) {
        listener();
      }
    })
  },
  close: () => {},
  assertQueue: async queuName => {
    queues[queuName] = createQueue();
  },
  assertExchange: async (exchangeName, type) => {
    if (type === 'headers') {
      exchanges[exchangeName] = createHeadersExchange();
    }
  },
  bindQueue: async (queue, sourceEchange, pattern, options = {}) => {
    const exchange = exchanges[sourceEchange];
    exchange.bindQueue(queue, pattern, options);
  },
  publish: async (exchangeName, routingKey, content, { headers } = {}) => {
    const exchange = exchanges[exchangeName];
    const queueName = exchange.getTargetQueue(routingKey, headers);

    queues[queueName].add({
      content,
      fields: {
        exchange: exchangeName,
        routingKey
      },
      properties: { headers: headers || {} }
    });
  },
  sendToQueue: async (queueName, content, { headers } = {}) => {
    queues[queueName].add({
      content,
      fields: {
        exchange: '',
        routingKey: queueName
      },
      properties: { headers: headers || {} }
    });
  },
  get: async (queueName, { noAck } = {}) => {
    return queues[queueName].get();
  },
  prefetch: async () => {},
  consume: async (queueName, consumer) => {
    queues[queueName].addConsumer(consumer);
    return { consumerTag: queueName };
  },
  cancel: async consumerTag => queues[consumerTag].stopConsume(),
  ack: async () => {},
  nack: async (message, allUpTo = false, requeue = true) => {
    if (requeue) {
      queues[message.fields.routingKey].add(message);
    }
  },
  checkQueue: queueName => ({
    queue: queueName,
    messageCount: queues[queueName].getMessageCount()
  }),
  purgeQueue: queueName => queues[queueName].purge()
});

module.exports = {
  connect: async () => ({
    createChannel,
    close: () => {}
  })
};
