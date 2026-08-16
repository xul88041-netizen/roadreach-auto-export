begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

select has_table('public', 'vehicles', 'vehicles table exists');
select has_table('public', 'customers', 'customers table exists');
select has_table('public', 'inquiries', 'inquiries table exists');
select has_view('public', 'public_vehicle_catalog', 'safe public catalog exists');
select has_column('public', 'vehicles', 'full_vin', 'admin vehicle has full VIN');
select hasnt_column('public', 'public_vehicle_catalog', 'full_vin', 'public catalog omits full VIN');
select hasnt_column('public', 'public_vehicle_catalog', 'internal_vehicle_cost_rmb', 'public catalog omits RMB cost');
select hasnt_column('public', 'public_vehicle_catalog', 'expected_profit_rmb', 'public catalog omits profit');

insert into public.vehicles(stock_id,brand,model,year,body_type,fuel_type,steering,sourcing_status,full_vin,internal_vehicle_cost_rmb,exchange_rate,target_profit_rmb)
values ('TEST-VIN-1','Test','Stock',2025,'SUV','PETROL','LHD','IN_STOCK','LFPH3ACC12345821',70000,7,5000);
select is((select masked_vin from public.vehicles where stock_id='TEST-VIN-1'),'LFPH3ACC****5821','in-stock VIN is masked');

insert into public.vehicles(stock_id,brand,model,year,body_type,fuel_type,steering,sourcing_status,full_vin)
values ('TEST-VIN-2','Test','Source',2025,'SUV','EV','LHD','AVAILABLE_TO_SOURCE','LFPH3ACC12345822');
select is((select masked_vin from public.vehicles where stock_id='TEST-VIN-2'),null,'source vehicle VIN is never public');

select is(round((select suggested_fob_price_usd from public.vehicles where stock_id='TEST-VIN-1'),2),round(75000::numeric/7,2),'suggested FOB uses cost plus target profit');
select * from finish();
rollback;
