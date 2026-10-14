import {Broker,BrokerError} from './base.js';
// Extension point: implement this contract using IBKR Gateway/TWS or Client Portal.
// Keep account selection, session management and live-trading enablement server-side.
export class IBKRBroker extends Broker {
  async quotes(){throw new BrokerError('IBKR adapter is reserved for a future integration.',501);}
  async snapshot(){throw new BrokerError('IBKR adapter is reserved for a future integration.',501);}
  async submitOrder(){throw new BrokerError('IBKR adapter is reserved for a future integration.',501);}
}
