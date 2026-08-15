export function calculateVehiclePricing(values) {
  const number = (key) => Number(values[key] || 0);
  const totalOtherCostRmb = number("domestic_transport_cost_rmb") + number("refurbishment_cost_rmb") + number("export_document_cost_rmb") + number("port_loading_cost_rmb") + number("other_cost_rmb");
  const totalCostRmb = number("internal_vehicle_cost_rmb") + totalOtherCostRmb;
  const exchangeRate = number("exchange_rate") || 1;
  const suggestedFobUsd = (totalCostRmb + number("target_profit_rmb")) / exchangeRate;
  const publicFobUsd = number("public_reference_fob_price_usd") || suggestedFobUsd;
  const saleRmb = publicFobUsd * exchangeRate;
  const expectedProfitRmb = saleRmb - totalCostRmb;
  const expectedMargin = saleRmb > 0 ? expectedProfitRmb / saleRmb : 0;
  return { totalOtherCostRmb, totalCostRmb, suggestedFobUsd, expectedProfitRmb, expectedMargin };
}
