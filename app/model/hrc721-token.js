module.exports = app => {
  const {CHAR} = app.Sequelize

  let HRC721Token = app.model.define('hrc721_token', {
    contractAddress: {
      type: CHAR(20).BINARY,
      primaryKey: true
    },
    tokenId: {
      type: CHAR(32).BINARY,
      primaryKey: true
    },
    holder: CHAR(20).BINARY
  }, {freezeTableName: true, underscored: true, timestamps: false})

  HRC721Token.associate = () => {
    const {Contract} = app.model
    Contract.hasMany(HRC721Token, {as: 'hrc721Tokens', foreignKey: 'contractAddress'})
    HRC721Token.belongsTo(Contract, {as: 'contract', foreignKey: 'contractAddress'})
  }

  return HRC721Token
}
