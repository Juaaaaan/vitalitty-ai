-- Permite borrar un documento de conocimiento entero.
--
-- La migración original dejó `documentos_conocimiento` con políticas de lectura,
-- creación y actualización y ninguna de borrado. Con RLS activo, una operación
-- sin política se deniega, así que un `delete` desde la aplicación afectaba a 0
-- filas sin error: la pantalla habría dicho que borró algo que seguía ahí.
--
-- Borrar un documento no es lo mismo que reescribir una versión. Las versiones
-- siguen siendo definitivas —no tienen política de `update` ni de `delete`, y
-- eso no cambia aquí—; lo que esta política permite es retirar el documento
-- completo, con su histórico, cuando ya no debe entrar en ninguna generación.
--
-- Las versiones se van con él por el `on delete cascade` de
-- `documento_versiones.documento_id`. Una acción en cascada la ejecuta el
-- sistema y no pasa por RLS, así que no hace falta política para ellas.
--
-- No deja nada huérfano: ninguna consulta referencia a un documento. El
-- conocimiento que usó una generación quedó escrito dentro de su markdown, así
-- que las dietas ya entregadas no cambian al borrar su fuente.

create policy "Users can delete own knowledge documents"
  on public.documentos_conocimiento for delete
  using (created_by = auth.uid());
