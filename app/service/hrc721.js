const {Service} = require('egg')

class HRC721Service extends Service {
  async listHRC721Tokens() {
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let {limit, offset} = this.ctx.state.pagination

    let result = await db.query(sql`
      SELECT COUNT(DISTINCT(hrc721_token.contract_address)) AS count FROM hrc721_token
      INNER JOIN hrc721 USING (contract_address)
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    let totalCount = result[0].count || 0
    let list = await db.query(sql`
      SELECT
        contract.address_string AS address, contract.address AS addressHex,
        hrc721.name AS name, hrc721.symbol AS symbol, hrc721.total_supply AS totalSupply,
        list.holders AS holders
      FROM (
        SELECT contract_address, COUNT(*) AS holders FROM hrc721_token
        INNER JOIN hrc721 USING (contract_address)
        GROUP BY contract_address
        ORDER BY holders DESC
        LIMIT ${offset}, ${limit}
      ) list
      INNER JOIN hrc721 USING (contract_address)
      INNER JOIN contract ON contract.address = list.contract_address
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})

    return {
      totalCount,
      tokens: list.map(item => ({
        address: item.address,
        addressHex: item.addressHex,
        name: item.name.toString(),
        symbol: item.symbol.toString(),
        totalSupply: BigInt(`0x${item.totalSupply.toString('hex')}`),
        holders: item.holders
      }))
    }
  }

  async getAllHRC721Balances(hexAddresses) {
    if (hexAddresses.length === 0) {
      return []
    }
    const db = this.ctx.model
    const {sql} = this.ctx.helper
    let list = await db.query(sql`
      SELECT
        contract.address AS addressHex, contract.address_string AS address,
        hrc721.name AS name,
        hrc721.symbol AS symbol,
        hrc721_token.count AS count
      FROM (
        SELECT contract_address, COUNT(*) AS count FROM hrc721_token
        WHERE holder IN ${hexAddresses}
        GROUP BY contract_address
      ) hrc721_token
      INNER JOIN contract ON contract.address = hrc721_token.contract_address
      INNER JOIN hrc721 ON hrc721.contract_address = hrc721_token.contract_address
    `, {type: db.QueryTypes.SELECT, transaction: this.ctx.state.transaction})
    return list.map(item => ({
      address: item.address,
      addressHex: item.addressHex,
      name: item.name.toString(),
      symbol: item.symbol.toString(),
      count: item.count
    }))
  }
}

module.exports = HRC721Service
