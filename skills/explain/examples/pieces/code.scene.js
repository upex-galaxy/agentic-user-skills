// Demo (9 s): code window; lines type in, the highlight glides between ranges, a pointer explains one line.
export const title = 'Código resaltado';

export default ({ scene }) => ({
  title,
  scenes: [
    scene({
      name: 'codigo',
      dur: 9.5,
      build(s) {
        s.label({ id: 'heading', text: 'Dónde se valida la clave', rect: { x: 160, y: 50, w: 1600, h: 110 }, px: 84, font: 'display', type: true, at: 0.2 });
        s.codeBlock({
          id: 'login',
          title: 'login.ts',
          area: { x: 120, y: 200, w: 1680, h: 780 },
          lines: [
            'async function login(email, pass) {',
            '  const user = await db.find(email);',
            '  if (!user) throw new Error("no existe");',
            '  const ok = await verify(pass, user.hash);',
            '  if (!ok) throw new Error("clave mala");',
            '  return sign({ id: user.id });',
            '}',
          ],
          at: 0.5,
          typeDur: 2.4,
          highlights: [{ lines: [2, 3], at: 4.2 }, { lines: 4, at: 5.8 }],
          pointer: { line: 4, text: 'Aquí se compara la clave con el hash', at: 6.3 },
        });
      },
    }),
  ],
});
