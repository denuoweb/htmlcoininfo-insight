module.exports = app => {
  const {CHAR, BLOB} = app.Sequelize

  let HRC721 = app.model.define('hrc721', {
    contractAddress: {
      type: CHAR(20).BINARY,
      primaryKey: true
    },
    name: {
      type: BLOB,
      get() {
        return this.getDataValue('name').toString()
      },
      set(name) {
        this.setDataValue('name', Buffer.from(name))
      }
    },
    symbol: {
      type: BLOB,
      get() {
        return this.getDataValue('symbol').toString()
      },
      set(symbol) {
        this.setDataValue('symbol', Buffer.from(symbol))
      }
    },
    totalSupply: {
      type: CHAR(32).BINARY,
      get() {
        let totalSupply = this.getDataValue('totalSupply')
        return totalSupply == null ? null : BigInt(`0x${totalSupply.toString('hex')}`)
      },
      set(totalSupply) {
        this.setDataValue(
          'totalSupply',
          Buffer.from(totalSupply.toString(16).padStart(64, '0'), 'hex')
        )
      }
    }
  }, {freezeTableName: true, underscored: true, timestamps: false})

  HRC721.associate = () => {
    const {ReceiptLog, Contract} = app.model
    ReceiptLog.belongsTo(HRC721, {as: 'hrc721', foreignKey: 'address', sourceKey: 'contractAddress'})
    HRC721.hasOne(ReceiptLog, {as: 'eventLogs', foreignKey: 'address', sourceKey: 'contractAddress'})
    Contract.hasOne(HRC721, {as: 'hrc721', foreignKey: 'contractAddress'})
    HRC721.belongsTo(Contract, {as: 'contract', foreignKey: 'contractAddress'})
  }

  return HRC721
}
