# JSON Schema Generator

Transforme exemplos de respostas JSON em JSON Schemas **Draft 2019-09**, diretamente no navegador. TypeScript, CodeMirror 6 e Vite, sem backend, banco de dados ou cadastro.

Repositório: [rwcosta/json-schema-generator](https://github.com/rwcosta/json-schema-generator).

Endereço esperado após ativar o GitHub Pages e concluir o primeiro deploy: **https://rwcosta.github.io/json-schema-generator/**.

## Executar localmente

Requisitos: Node.js **24 ou superior** e npm. Use a versão 24 para reproduzir o ambiente da CI.

```sh
npm ci
npm run dev
```

Abra o endereço local exibido pelo Vite. Não abra `index.html` por `file://`: os módulos e o Web Worker precisam de um servidor HTTP. Nenhum servidor de aplicação é necessário em produção.

## Usar a ferramenta

1. Cole um JSON válido no editor da esquerda ou carregue o exemplo.
2. Clique em **Gerar Schema** ou pressione **Ctrl+Enter** (macOS: **⌘+Enter**) no editor.
3. Revise o resultado à direita.
4. Use o ícone de dois quadrados no canto superior direito de cada editor para copiar o JSON de entrada ou o schema gerado. **Baixar JSON** permanece na barra inferior.
5. Use **Limpar** para apagar os dois campos.

Editar a entrada torna a saída anterior desatualizada e bloqueia cópia/download até uma nova geração. O botão **Cancelar** interrompe uma geração em andamento. Há temas claro e escuro, com preferência salva localmente. Os JSONs não são persistidos.

## Regras de inferência

- `$schema` é a primeira propriedade, somente na raiz: `https://json-schema.org/draft/2019-09/schema`.
- Objetos usam `type`, `required`, `properties`, nessa ordem. Todos os campos de cada objeto observado entram em `required`.
- Nomes e ordem de propriedades são preservados, inclusive chaves como `"10"`, `"2"`, `"1"` e `"__proto__"`.
- Strings e datas geram `string`, sem `format`. Booleanos geram `boolean`; `null` gera `null`.
- Tokens numéricos sem ponto nem expoente geram `integer`; com ponto ou expoente geram `number`. Exemplos: `10` → `integer`; `10.00`, `1e3` → `number`.
- Inteiros grandes são classificados sem convertê-los para `Number`, evitando perda de precisão durante a inferência.
- Arrays sempre usam `items`. Vazios usam `items: {}`; arrays homogêneos usam um schema; heterogêneos usam `anyOf` com alternativas distintas na ordem da primeira ocorrência.
- Cada alternativa de objeto mantém seus próprios campos em `required`. Não se cria uma união de campos opcionais. Duas estruturas com a mesma forma mas ordem de propriedades diferente permanecem alternativas distintas.
- Objetos vazios usam `required: []` e `properties: {}`.
- Raízes objeto, array, string, número, booleano e `null` são aceitas.
- Chaves duplicadas são rejeitadas, inclusive quando escritas com escapes equivalentes.
- Sem `title`, `additionalProperties`, `description`, `examples`, `default`, `enum` ou restrições não observadas. `anyOf` é a única palavra adicional de composição usada.
- Dois espaços de indentação, sem linhas em branco extras.

**Um exemplo não define todo o contrato da API.** A ausência de `additionalProperties` permite campos extras. `integer` no JSON Schema verifica o valor matemático, não a grafia: um validador pode aceitar `10.00` para um schema `integer`. A distinção textual orienta a geração, mas não vira uma restrição lexical no schema. Alternativas de `anyOf` podem se sobrepor.

## Limites e privacidade

| Recurso              | Limite                                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| Entrada UTF-8        | 1 MiB                                                                             |
| Profundidade         | 100 arestas entre a raiz e o valor mais profundo; raiz = 0                        |
| Nós                  | 100.000 valores, incluindo contêineres; nomes de propriedades não contam como nós |
| Saída UTF-8          | 10 MiB                                                                            |
| Geração no navegador | 5 segundos, incluindo inicialização e comunicação do Worker                       |

O parser aplica limites durante a leitura; o serializador conta bytes durante a escrita. O processamento ocorre em um Web Worker, que pode ser encerrado sem bloquear a interface.

Não há `eval`, upload, analytics, fontes externas ou dependências de CDN em tempo de execução. Dados do usuário são inseridos como texto. O único uso de `localStorage` é a preferência de tema. A cópia usa a Clipboard API, que exige contexto seguro (HTTPS ou localhost); se bloqueada, o resultado é selecionado para cópia manual. O provedor de hospedagem ainda recebe as requisições normais dos arquivos do site.

## Testes e build

```sh
npm test
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Em Linux, a primeira instalação pode exigir `npx playwright install --with-deps chromium`. `npm run check` executa os testes unitários e o build com verificação de tipos. `npm run test:watch` inicia o modo contínuo.

Os testes verificam a saída exata do exemplo, ordem textual, precisão lexical, estruturas heterogêneas, erros e limites. Ajv valida os schemas contra o metasschema 2019-09 e verifica os exemplos representáveis pelo runtime JavaScript. Casos numéricos fora da precisão/faixa do JavaScript são testados pela classificação textual, sem fingir uma validação numérica exata com `JSON.parse`.

Os testes Playwright cobrem desktop e celular: geração, atalho, download, cópia, limpeza, tema, erros, saída desatualizada, ausência de envio de JSON e contenção de texto malicioso.

O build produz somente arquivos estáticos em `dist/`. Para conferir a versão de produção:

```sh
npm run build
npm run preview
```

## Estrutura

```text
src/core/         Parser ordenado, inferência, serialização e limites
src/workers/      Geração fora da thread da interface
src/main.ts       Editores e interação
src/styles.css    Layout responsivo e temas
tests/fixtures/   Exemplo de referência
tests/unit/       Regras de geração e limites
tests/e2e/        Fluxos reais de navegador
.github/workflows/ CI de pull requests e deploy validado da main
docs/             Decisões de arquitetura
```

## Publicar no GitHub Pages

1. Mantenha o repositório **público** para usar Pages no GitHub Free.
2. Em **Settings → Pages → Build and deployment**, selecione **GitHub Actions** como Source.
3. Envie as alterações à branch `main`. Se o código já estiver lá, execute **Actions → Validate and deploy Pages → Run workflow**.
4. Aguarde os jobs `build` e `deploy`. A URL publicada aparece no ambiente `github-pages` e nas configurações de Pages.

O workflow executa `npm ci`, testes unitários, typecheck, build e testes desktop/mobile antes de enviar `dist/` ao Pages. Pull requests executam os mesmos checks sem publicar. Não é preciso criar um PAT ou armazenar segredos: o deploy utiliza o token temporário e OIDC do próprio Actions, com permissões restritas ao job de deploy.

```sh
git clone https://github.com/rwcosta/json-schema-generator.git
cd json-schema-generator
npm ci
# Após editar e validar:
git add .
git commit -m "Atualiza o gerador"
git push origin main
```

`base: './'` mantém os assets e o Worker compatíveis com o subdiretório `/json-schema-generator/`. Não há roteamento SPA nem configuração de domínio obrigatório.

O projeto usa apenas hospedagem estática, subdomínio gratuito e runners padrão em repositório público. Não habilite serviços pagos ou runners maiores. O custo zero depende dos termos e limites vigentes do GitHub; as cotas não são uma promessa de recursos ilimitados. Consulte os [limites do Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/github-pages-limits) e a [cobrança do Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Se o primeiro deploy falhar com erro de site Pages inexistente, revise o Source em Settings → Pages e execute o workflow novamente. Se houver aprovação obrigatória no ambiente `github-pages`, um mantenedor deve liberá-la no GitHub.

## Outras hospedagens estáticas

O mesmo `dist/` pode ser publicado em Cloudflare Pages ou outro serviço estático. Configure `npm ci && npm run build` como build e `dist` como pasta de saída. Não ative Functions, banco ou serviços adicionais: eles não fazem parte da aplicação.
