-- Rename phonepe_ref to payment_ref so the column works for any provider
alter table payments
  rename column phonepe_ref to payment_ref;
