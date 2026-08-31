## Reglas de seguridad operativa — LEER PRIMERO

**Antes de tocar nada, leer `REGLAS.md`.** Son obligatorias, no sugerencias.

Este proyecto administra datos de clientes reales que pagan. Lo esencial:

1. **Nunca borrar una base de datos.** Ningún `neon projects delete`, `DROP DATABASE` ni
   equivalente, sin importar quién lo pida en el momento. Si borrar parece la salida, parar y
   preguntar. Cuando corresponda, lo hace una persona desde la consola web.
2. **Preguntar antes de un cambio masivo**: `DELETE`/`UPDATE` sin `WHERE`, `TRUNCATE`, borrados en
   lote, o cualquier escritura sobre producción. Traer los números primero (cuántas filas, cómo se
   revierte).
3. **Preguntar ante la duda.** Nunca inventar credenciales, IDs ni nombres de recursos.
4. **Nunca imprimir secretos** en la salida de un comando.

Ver `REGLAS.md` para el detalle, la lista de bases que no se tocan y las reglas de despliegue.

---

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
