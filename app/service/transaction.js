const {Service} = require('egg')

class TransactionService extends Service {
  async getTransaction(id) {
    const {
      Header, Address,
      Transaction, Witness, TransactionOutput, GasRefund, Receipt, ReceiptLog, ContractSpend,
      Contract, Hrc20: HRC20, Hrc721: HRC721,
      where, col
    } = this.ctx.model
    const {in: $in} = this.app.Sequelize.Op
    const {Address: RawAddress} = this.app.htmlcoininfo.lib

    let transaction = await Transaction.findOne({
      where: {id},
      include: [
        {
          model: Header,
          as: 'header',
          required: false,
          attributes: ['hash', 'timestamp']
        },
        {
          model: ContractSpend,
          as: 'contractSpendSource',
          required: false,
          attributes: ['destTxId']
        }
      ],
      transaction: this.ctx.state.transaction
    })
    if (!transaction) {
      return null
    }
    let witnesses = await Witness.findAll({
      where: {transactionId: id},
      attributes: ['inputIndex', 'script'],
      order: [['inputIndex', 'ASC'], ['witnessIndex', 'ASC']],
      transaction: this.ctx.state.transaction
    })

    let inputs = await TransactionOutput.findAll({
      where: {inputTxId: id},
      include: [{
        model: Address,
        as: 'address',
        required: false,
        attributes: ['type', 'string'],
        include: [{
          model: Contract,
          as: 'contract',
          required: false,
          attributes: ['address', 'addressString']
        }]
      }],
      order: [['inputIndex', 'ASC']],
      transaction: this.ctx.state.transaction
    })
    let outputs = await TransactionOutput.findAll({
      where: {outputTxId: id},
      include: [
        {
          model: Address,
          as: 'address',
          required: false,
          attributes: ['type', 'string'],
          include: [{
            model: Contract,
            as: 'contract',
            required: false,
            attributes: ['address', 'addressString']
          }]
        },
        {
          model: GasRefund,
          as: 'refund',
          on: {
            transactionId: where(col('refund.transaction_id'), '=', col('transaction_output.output_transaction_id')),
            outputIndex: where(col('refund.output_index'), '=', col('transaction_output.output_index'))
          },
          required: false,
          attributes: ['refundTxId', 'refundIndex'],
          include: [{
            model: TransactionOutput,
            as: 'refundTo',
            on: {
              transactionId: where(col('refund->refundTo.output_transaction_id'), '=', col('refund.refund_transaction_id')),
              outputIndex: where(col('refund->refundTo.output_index'), '=', col('refund.refund_index'))
            },
            required: true,
            attributes: ['value']
          }]
        },
        {
          model: GasRefund,
          as: 'refundTo',
          on: {
            transactionId: where(col('refundTo.refund_transaction_id'), '=', col('transaction_output.output_transaction_id')),
            outputIndex: where(col('refundTo.refund_index'), '=', col('transaction_output.output_index'))
          },
          required: false,
          attributes: ['transactionId', 'outputIndex']
        },
        {
          model: Receipt,
          as: 'receipt',
          on: {
            transactionId: where(col('receipt.transaction_id'), '=', transaction._id),
            outputIndex: where(col('receipt.output_index'), '=', col('transaction_output.output_index'))
          },
          required: false,
          include: [{
            model: Contract,
            as: 'contract',
            required: true,
            attributes: ['addressString']
          }]
        }
      ],
      order: [['outputIndex', 'ASC']],
      transaction: this.ctx.state.transaction
    })

    let eventLogs = []
    let contractSpends = []

    if (outputs.some(output => output.receipt)) {
      eventLogs = await ReceiptLog.findAll({
        where: {receiptId: {[$in]: outputs.filter(output => output.receipt).map(output => output.receipt._id)}},
        include: [
          {
            model: Contract,
            as: 'contract',
            required: true,
            attributes: ['addressString']
          },
          {
            model: HRC20,
            as: 'hrc20',
            required: false,
            attributes: ['name', 'symbol', 'decimals']
          },
          {
            model: HRC721,
            as: 'hrc721',
            required: false,
            attributes: ['name', 'symbol']
          }
        ],
        order: [['_id', 'ASC']],
        transaction: this.ctx.state.transaction
      })
      let contractSpendIds = (await Transaction.findAll({
        attributes: ['id'],
        include: [{
          model: ContractSpend,
          as: 'contractSpendSource',
          required: true,
          attributes: [],
          where: {destTxId: id}
        }],
        order: [['blockHeight', 'ASC'], ['indexInBlock', 'ASC']],
        transaction: this.ctx.state.transaction
      })).map(item => item.id)
      if (contractSpendIds.length) {
        let inputs = await TransactionOutput.findAll({
          where: {inputTxId: {[$in]: contractSpendIds}},
          attributes: ['inputTxId', 'value'],
          include: [{
            model: Address,
            as: 'address',
            required: false,
            attributes: ['type', 'string'],
            include: [{
              model: Contract,
              as: 'contract',
              required: false,
              attributes: ['address', 'addressString']
            }]
          }],
          order: [['inputIndex', 'ASC']],
          transaction: this.ctx.state.transaction
        })
        let outputs = await TransactionOutput.findAll({
          where: {outputTxId: {[$in]: contractSpendIds}},
          attributes: ['outputTxId', 'value'],
          include: [{
            model: Address,
            as: 'address',
            required: false,
            attributes: ['type', 'string'],
            include: [{
              model: Contract,
              as: 'contract',
              required: false,
              attributes: ['address', 'addressString']
            }]
          }],
          order: [['outputIndex', 'ASC']],
          transaction: this.ctx.state.transaction
        })
        for (let id of contractSpendIds) {
          contractSpends.push({
            inputs: inputs.filter(input => Buffer.compare(input.inputTxId, id) === 0).map(input => ({
              address: input.address && ([RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(input.address.type) && input.address.contract
                ? input.address.contract.addressString
                : input.address.string
              ),
              addressHex: input.address && [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(input.address.type) && input.address.contract
                ? input.address.contract.address
                : null,
              value: input.value
            })),
            outputs: outputs.filter(output => Buffer.compare(output.outputTxId, id) === 0).map(output => ({
              address: output.address && ([RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(output.address.type) && output.address.contract
                ? output.address.contract.addressString
                : output.address.string
              ),
              addressHex: output.address && [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(output.address.type) && output.address.contract
                ? output.address.contract.address
                : null,
              value: output.value
            }))
          })
        }
      }
    }

    return {
      id: transaction.id,
      hash: transaction.hash,
      version: transaction.version,
      flag: transaction.flag,
      inputs: inputs.map(input => ({
        prevTxId: input.outputTxId || Buffer.alloc(32),
        outputIndex: input.outputIndex == null ? 0xffffffff : input.outputIndex,
        scriptSig: input.scriptSig,
        sequence: input.sequence,
        address: input.address && ([RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(input.address.type) && input.address.contract
          ? input.address.contract.addressString
          : input.address.string
        ),
        addressHex: input.address && [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(input.address.type) && input.address.contract
          ? input.address.contract.address
          : null,
        value: input.value
      })),
      outputs: outputs.map(output => {
        let outputObject = {
          scriptPubKey: output.scriptPubKey,
          address: output.address && ([RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(output.address.type) && output.address.contract
            ? output.address.contract.addressString
            : output.address.string
          ),
          addressHex: output.address && [RawAddress.CONTRACT, RawAddress.EVM_CONTRACT].includes(output.address.type) && output.address.contract
            ? output.address.contract.address
            : null,
          value: output.value,
        }
        if (output.inputTxId) {
          outputObject.spentTxId = output.inputTxId
          outputObject.spentIndex = output.inputIndex
        }
        if (output.refund) {
          outputObject.refundTxId = output.refund.refundTxId
          outputObject.refundIndex = output.refund.refundIndex
          outputObject.refundValue = output.refund.refundTo.value
        }
        outputObject.isRefund = Boolean(output.refundTo)
        if (output.receipt) {
          outputObject.receipt = {
            gasUsed: output.receipt.gasUsed,
            contractAddress: output.receipt.contract.addressString,
            contractAddressHex: output.receipt.contractAddress,
            excepted: output.receipt.excepted,
            logs: eventLogs.filter(log => log.receiptId === output.receipt._id).map(log => ({
              address: log.contract.addressString,
              addressHex: log.address,
              topics: this.transformTopics(log),
              data: log.data,
              ...log.hrc20 ? {
                hrc20: {
                  name: log.hrc20.name,
                  symbol: log.hrc20.symbol,
                  decimals: log.hrc20.decimals
                }
              } : {},
              ...log.hrc721 ? {
                hrc721: {
                  name: log.hrc721.name,
                  symbol: log.hrc721.symbol
                }
              } : {}
            }))
          }
        }
        return outputObject
      }),
      witnesses: this.transformWitnesses(witnesses),
      lockTime: transaction.lockTime,
      ...transaction.header ? {
        block: {
          hash: transaction.header.hash,
          height: transaction.blockHeight,
          timestamp: transaction.header.timestamp,
        }
      } : {},
      ...transaction.contractSpendSource ? {contractSpendSource: transaction.contractSpendSource.destTxId} : {},
      contractSpends,
      size: transaction.size,
      weight: transaction.weight
    }
  }

  async getRawTransaction(id) {
    const {Transaction, Witness, TransactionOutput} = this.ctx.model
    const {Transaction: RawTransaction, Input, Output, Script} = this.app.htmlcoininfo.lib

    let transaction = await Transaction.findOne({
      where: {id},
      attributes: ['version', 'flag', 'lockTime'],
      transaction: this.ctx.state.transaction
    })
    if (!transaction) {
      return null
    }
    let witnesses = await Witness.findAll({
      where: {transactionId: id},
      attributes: ['inputIndex', 'script'],
      order: [['inputIndex', 'ASC'], ['witnessIndex', 'ASC']],
      transaction: this.ctx.state.transaction
    })

    let inputs = await TransactionOutput.findAll({
      where: {inputTxId: id},
      attributes: ['outputTxId', 'outputIndex', 'scriptSig', 'sequence'],
      order: [['inputIndex', 'ASC']],
      transaction: this.ctx.state.transaction
    })
    let outputs = await TransactionOutput.findAll({
      where: {outputTxId: id},
      attributes: ['value', 'scriptPubKey'],
      order: [['outputIndex', 'ASC']],
      transaction: this.ctx.state.transaction
    })

    return new RawTransaction({
      version: transaction.version,
      flag: transaction.flag,
      inputs: inputs.map(input => new Input({
        prevTxId: input.outputTxId || Buffer.alloc(32),
        outputIndex: input.outputIndex == null ? 0xffffffff : input.outputIndex,
        scriptSig: Script.fromBuffer(input.scriptSig, {isCoinbase: this.outputIndex == null, isInput: true}),
        sequence: input.sequence
      })),
      outputs: outputs.map(output => new Output({
        value: output.value,
        scriptPubKey: Script.fromBuffer(output.scriptPubKey, {isOutput: true})
      })),
      witnesses: this.transformWitnesses(witnesses),
      lockTime: transaction.lockTime
    })
  }

  async getRecentTransactions(count = 10) {
    const {Transaction} = this.ctx.model
    const {or: $or, gt: $gt, lte: $lte} = this.app.Sequelize.Op

    return (await Transaction.findAll({
      where: {
        indexInBlock: {[$gt]: 0},
        [$or]: [
          {blockHeight: {[$lte]: 5000}},
          {indexInBlock: {[$gt]: 1}}
        ]
      },
      attributes: ['id'],
      order: [['blockHeight', 'DESC'], ['indexInBlock', 'DESC'], ['_id', 'DESC']],
      limit: count,
      transaction: this.ctx.state.transaction
    })).map(tx => tx.id)
  }

  async getMempoolTransactionAddresses(id) {
    const {Address, Transaction, BalanceChange} = this.ctx.model
    let balanceChanges = await BalanceChange.findAll({
      attributes: [],
      include: [
        {
          model: Transaction,
          as: 'transaction',
          required: true,
          where: {id},
          attributes: []
        },
        {
          model: Address,
          as: 'address',
          required: true,
          attributes: ['string']
        }
      ],
      transaction: this.ctx.state.transaction
    })
    return balanceChanges.map(item => item.address.string)
  }

  async sendRawTransaction(data) {
    let client = new this.app.htmlcoininfo.rpc(this.app.config.htmlcoininfo.rpc)
    let id = await client.sendrawtransaction(data.toString('hex'))
    return Buffer.from(id, 'hex')
  }

  async transformTransaction(transaction, {brief = false} = {}) {
    let confirmations = transaction.block ? this.app.blockchainInfo.tip.height - transaction.block.height + 1 : 0
    let inputValue = transaction.inputs.map(input => input.value).reduce((x, y) => x + y)
    let outputValue = transaction.outputs.map(output => output.value).reduce((x, y) => x + y)
    let refundValue = transaction.outputs
      .map(output => output.refundValue)
      .filter(Boolean)
      .reduce((x, y) => x + y, 0n)
    let refundToValue = transaction.outputs
      .filter(output => output.isRefund)
      .map(output => output.value)
      .reduce((x, y) => x + y, 0n)
    let inputs = this.isCoinbase(transaction.inputs[0])
      ? [{
        coinbase: transaction.inputs[0].scriptSig.toString('hex'),
        ...brief ? {} : {
          sequence: transaction.inputs[0].sequence,
          index: 0
        }
      }]
      : transaction.inputs.map((input, index) => this.transformInput(input, index, {brief}))
    let outputs = transaction.outputs.map((output, index) => this.transformOutput(output, index, {brief}))

    let [hrc20TokenTransfers, hrc721TokenTransfers] = await Promise.all([
      this.transformHRC20Transfers(transaction.outputs),
      this.transformHRC721Transfers(transaction.outputs)
    ])

    return {
      id: transaction.id.toString('hex'),
      ...brief ? {} : {
        hash: transaction.hash.toString('hex'),
        version: transaction.version,
        witnesses: transaction.witnesses.map(list => list.map(script => script.toString('hex'))),
        lockTime: transaction.lockTime,
        blockHash: transaction.block && transaction.block.hash.toString('hex')
      },
      inputs,
      outputs,
      isCoinbase: this.isCoinbase(transaction.inputs[0]),
      isCoinstake: this.isCoinstake(transaction),
      blockHeight: transaction.block && transaction.block.height,
      confirmations,
      timestamp: transaction.block && transaction.block.timestamp,
      inputValue: inputValue.toString(),
      outputValue: outputValue.toString(),
      refundValue: refundValue.toString(),
      fees: (inputValue - outputValue - refundValue + refundToValue).toString(),
      ...brief ? {} : {
        size: transaction.size,
        weight: transaction.weight
      },
      contractSpendSource: transaction.contractSpendSource && transaction.contractSpendSource.toString('hex'),
      contractSpends: transaction.contractSpends.map(({inputs, outputs}) => ({
        inputs: inputs.map(input => ({
          address: input.address,
          addressHex: input.addressHex.toString('hex'),
          value: input.value.toString()
        })),
        outputs: outputs.map(output => ({
          address: output.address,
          addressHex: output.addressHex && output.addressHex.toString('hex'),
          value: output.value.toString()
        }))
      })),
      hrc20TokenTransfers,
      hrc721TokenTransfers
    }
  }

  transformWitnesses(witnesses) {
    let result = []
    let lastInputIndex = null
    for (let {inputIndex, script} of witnesses) {
      if (inputIndex !== lastInputIndex) {
        result.push([])
      }
      result[result.length - 1].push(script)
    }
    return result
  }

  transformInput(input, index, {brief}) {
    return {
      prevTxId: input.prevTxId.toString('hex'),
      value: input.value.toString(),
      address: input.address,
      addressHex: input.addressHex && input.addressHex.toString('hex'),
      ...brief ? {} : {
        outputIndex: input.outputIndex,
        sequence: input.sequence,
        index,
        scriptSig: {
          hex: input.scriptSig.toString('hex'),
          asm: this.app.htmlcoininfo.lib.Script.fromBuffer(
            input.scriptSig,
            {isCoinbase: this.isCoinbase(input), isInput: true}
          ).toString()
        }
      }
    }
  }

  transformOutput(output, index, {brief}) {
    const {Script} = this.app.htmlcoininfo.lib
    let scriptPubKey = Script.fromBuffer(output.scriptPubKey, {isOutput: true})
    let type = {
      [Script.UNKNOWN]: 'nonstandard',
      [Script.PUBKEY_OUT]: 'pubkey',
      [Script.PUBKEYHASH_OUT]: 'pubkeyhash',
      [Script.SCRIPT_OUT]: 'scripthash',
      [Script.MULTISIG_OUT]: 'multisig',
      [Script.DATA_OUT]: 'nulldata',
      [Script.WITNESS_V0_KEYHASH]: 'witness_v0_keyhash',
      [Script.WITNESS_V0_SCRIPTHASH]: 'witness_v0_scripthash',
      [Script.EVM_CONTRACT_CREATE]: 'create',
      [Script.EVM_CONTRACT_CALL]: 'call',
      [Script.CONTRACT_OUT]: 'call',
    }[scriptPubKey.type]
    let result = {
      value: output.value.toString(),
      address: output.address,
      addressHex: output.addressHex && output.addressHex.toString('hex'),
      scriptPubKey: {type}
    }
    if (!brief) {
      result.scriptPubKey.hex = output.scriptPubKey.toString('hex')
      result.scriptPubKey.asm = scriptPubKey.toString()
    }
    if (output.spentTxId) {
      result.spentTxId = output.spentTxId.toString('hex')
      result.spentIndex = output.spentIndex
    }
    if (output.receipt) {
      result.receipt = {
        gasUsed: output.receipt.gasUsed,
        contractAddress: output.receipt.contractAddress,
        contractAddressHex: output.receipt.contractAddressHex.toString('hex'),
        excepted: output.receipt.excepted,
        logs: output.receipt.logs.map(log => ({
          address: log.address,
          addressHex: log.addressHex.toString('hex'),
          topics: log.topics.map(topic => topic.toString('hex')),
          data: log.data.toString('hex')
        }))
      }
    }
    return result
  }

  async transformHRC20Transfers(outputs) {
    const TransferABI = this.app.htmlcoininfo.lib.Solidity.hrc20ABIs.find(abi => abi.name === 'Transfer')
    let result = []
    for (let output of outputs) {
      if (output.receipt) {
        for (let {address, addressHex, topics, data, hrc20} of output.receipt.logs) {
          if (hrc20 && topics.length === 3 && Buffer.compare(topics[0], TransferABI.id) === 0 && data.length === 32) {
            let [from, to] = await this.ctx.service.contract.transformHexAddresses([topics[1].slice(12), topics[2].slice(12)])
            result.push({
              address,
              addressHex: addressHex.toString('hex'),
              name: hrc20.name,
              symbol: hrc20.symbol,
              decimals: hrc20.decimals,
              ...from && typeof from === 'object' ? {from: from.string, fromHex: from.hex.toString('hex')} : {from},
              ...to && typeof to === 'object' ? {to: to.string, toHex: to.hex.toString('hex')} : {to},
              value: BigInt(`0x${data.toString('hex')}`).toString()
            })
          }
        }
      }
    }
    return result
  }

  async transformHRC721Transfers(outputs) {
    const TransferABI = this.app.htmlcoininfo.lib.Solidity.hrc20ABIs.find(abi => abi.name === 'Transfer')
    let result = []
    for (let output of outputs) {
      if (output.receipt) {
        for (let {address, addressHex, topics, hrc721} of output.receipt.logs) {
          if (hrc721 && topics.length === 4 && Buffer.compare(topics[0], TransferABI.id) === 0) {
            let [from, to] = await this.ctx.service.contract.transformHexAddresses([topics[1].slice(12), topics[2].slice(12)])
            result.push({
              address,
              addressHex: addressHex.toString('hex'),
              name: hrc721.name,
              symbol: hrc721.symbol,
              ...from && typeof from === 'object' ? {from: from.string, fromHex: from.hex.toString('hex')} : {from},
              ...to && typeof to === 'object' ? {to: to.string, toHex: to.hex.toString('hex')} : {to},
              tokenId: topics[3].toString('hex')
            })
          }
        }
      }
    }
    return result
  }

  isCoinbase(input) {
    return Buffer.compare(input.prevTxId, Buffer.alloc(32)) === 0 && input.outputIndex === 0xffffffff
  }

  isCoinstake(transaction) {
    return transaction.inputs.length > 0 && Buffer.compare(transaction.inputs[0].prevTxId, Buffer.alloc(32)) !== 0
      && transaction.outputs.length >= 2 && transaction.outputs[0].value === 0n && transaction.outputs[0].scriptPubKey.length === 0
  }

  transformTopics(log) {
    let result = []
    if (log.topic1) {
      result.push(log.topic1)
    }
    if (log.topic2) {
      result.push(log.topic2)
    }
    if (log.topic3) {
      result.push(log.topic3)
    }
    if (log.topic4) {
      result.push(log.topic4)
    }
    return result
  }
}

module.exports = TransactionService
