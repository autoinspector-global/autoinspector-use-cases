const availableGoodEntity = require("../../entity/available-good.entity");

class AvailableGoodsSeeder {
  static async seed() {
    await availableGoodEntity.insertMany([
      {
        category: "sports",
        type: "golf_set",
      },
      {
        category: "electronics",
        type: "mobile",
      },
      {
        category: "home",
        type: "tv",
      },
      {
        category: "mobility",
        type: "bike",
      },
    ]);
  }
}

module.exports = AvailableGoodsSeeder;
