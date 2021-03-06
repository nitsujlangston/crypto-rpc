const EthRPC = require('../eth/EthRpc');
const erc20 = require('./erc20.json');
const AbiDecoder = require('abi-decoder');
class Erc20RPC extends EthRPC {
  constructor(config) {
    super(config);
    this.tokenContractAddress = config.currencyConfig.tokenContractAddress;
    this.erc20Contract = new this.web3.eth.Contract(erc20, this.tokenContractAddress);
  }

  // this will only work on ERC20 tokens with decimals
  async sendToAddress(address, amount, callback, passphrase) {
    const amountStr = amount.toString();
    const decimalIndex = amountStr.indexOf('.');

    let precision = 0;
    if(decimalIndex >= 0) {
      // if there is a decimal, determine the number of decimal places
      precision = amountStr.length - (decimalIndex + 1);
    }

    const decimals = await this.erc20Contract.methods.decimals().call();
    if(precision > decimals) {
      throw new Error('Precision provided is greater than the ERC20 precision');
    }
    if(precision > 20) {
      throw new Error('Precision provided is too high for this library');
    }

    const decimalsBN = this.web3.utils.toBN(decimals - precision);
    const TEN = this.web3.utils.toBN(10);

    // This line is why we can't handle a shift amount > 20
    // BigNum can't handle scientific notation,
    // or floats, so we must convert amount into an integer
    const bigNumAmount = this.web3.utils.toBN(amount * Math.pow(10, precision));
    const scaledAmount = bigNumAmount.mul(TEN.pow(decimalsBN)).toString();
    const gasPrice = await this.estimateGasPrice();
    const contractData = this.erc20Contract.methods
      .transfer(address, scaledAmount).encodeABI();
    return this.web3.eth.personal
      .sendTransaction({ from: this.account, gasPrice, data: contractData, to: this.tokenContractAddress },
        passphrase, (err, result) => {
          if(callback) {
            callback(err, { result });
          }
          return { result };
        });
  }

  async getBalance(address, callback) {
    try {
      if (address) {
        const balance = await this.erc20Contract.methods.balanceOf(address).call();
        if (callback) {
          return callback(null, balance);
        } else {
          return balance;
        }
      } else {
        const accounts = await this.web3.eth.getAccounts();
        const balances = [];
        for (let account of accounts) {
          const balance = await this.getBalance(account);
          balances.push({ account,  balance });
        }
        if (callback) {
          return callback(null, balances);
        } else {
          return balances;
        }
      }
    } catch (err) {
      if (callback) {
        return callback(err);
      }
    }
  }

  async decodeRawTransaction(rawTx, cb) {
    try {
      const decodedEthTx = await super.decodeRawTransaction(rawTx);
      if(decodedEthTx.data) {
        AbiDecoder.addABI(erc20);
        decodedEthTx.decodedData = AbiDecoder.decodeMethod('0x' + decodedEthTx.data);
      }
      if(cb) {
        cb(null, decodedEthTx);
      }
      return decodedEthTx;
    } catch(err) {
      if(cb) cb(err);
    }
  }
}

module.exports = Erc20RPC;
