-- Ejecutar DESPUÉS de edubank_completo.sql (SQL Editor > Run)
create view saldos with (security_invoker=true) as
 select p.id as estudiante_id, p.colegio_id, coalesce(sum(m.monto),0) as saldo
 from perfiles p left join movimientos m on m.estudiante_id=p.id
 where p.rol='estudiante' group by p.id;
grant select on saldos to authenticated;
create policy canjes_entregar on canjes for update using (colegio_id=mi_colegio() and mi_rol() in ('admin','docente')) with check (colegio_id=mi_colegio());
