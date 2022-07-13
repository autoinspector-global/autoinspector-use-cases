const availablePolicyEntity = require("../../entity/available-policy.entity");

class AvailablePoliciesSeeder {
  static async seed() {
    await availablePolicyEntity.insertMany([
      {
        coverages: ["Seguro Total"],
        name: "Poliza Bienes - Seguro Total",
      },
      {
        coverages: ["Seguro Parcial"],
        name: "Poliza Bienes - Seguro Parcial",
      },
    ]);
  }
}

module.exports = AvailablePoliciesSeeder;
