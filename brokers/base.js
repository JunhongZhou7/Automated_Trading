// Broker-neutral contract. Strategies and UI must not depend on provider HTTP schemas.
export class Broker {
  get capabilities() { return {marketData:false,paperOrders:false,options:false,automatedExecution:false}; }
  async quotes() { throw new Error('Market data not implemented'); }
  async snapshot() { throw new Error('Account access not implemented'); }
  async marketClock() { throw new Error('Market clock not implemented'); }
  async submitOrder() { throw new Error('Order execution not implemented'); }
  async cancelOrder() { throw new Error('Cancellation not implemented'); }
}
export class BrokerError extends Error {
  constructor(message,status=502) {super(message);this.status=status;}
}
