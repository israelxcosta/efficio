# Skills de design instaladas (23/11/2026)

Copiadas dos pacotes enviados pelo dono (licença MIT): `ui-ux-pro-max-skill`, `vercel-labs/agent-skills` e
`bencium-marketplace`. Só as de design/UI/React; as de deploy (Vercel), marketing, idiomas e o hook de status
line ficaram de fora.

| Skill | Origem | Para quê |
| --- | --- | --- |
| `ui-ux-pro-max` | ui-ux-pro-max | Base de dados de estilos, paletas, tipografia, gráficos e UX (busca local em CSV). |
| `design-system` | ui-ux-pro-max | Tokens em 3 camadas (primitivo → semântico → componente). |
| `ui-styling` | ui-ux-pro-max | Radix/shadcn + Tailwind. |
| `web-design-guidelines` | vercel agent-skills | Revisão contra as Web Interface Guidelines. |
| `react-best-practices`, `composition-patterns`, `react-view-transitions` | vercel agent-skills | Desempenho, composição e transições em React. |
| `design-audit`, `typography`, `bencium-controlled-ux-designer`, `bencium-impact-designer` | bencium | Auditoria visual, tipografia e direção de UI. |

Removidos ao instalar: fontes de pôster do `ui-styling/canvas-fonts` (5,8 MB) e pastas de teste.
Não executar `ui-styling/scripts/shadcn_add.py` (roda `npx`) nem `design-system/scripts/fetch-background.py`
(acessa a rede) sem revisar antes.
