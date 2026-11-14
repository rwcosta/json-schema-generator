# Decisões de arquitetura

## Aplicação estática

O site transforma exemplos em schemas sem estado compartilhado. HTML, CSS e TypeScript resolvem a necessidade; Java, Spring Boot e banco de dados foram descartados por decisão do usuário. Vite compila módulos e empacota CodeMirror. O servidor local é uma ferramenta de desenvolvimento; a hospedagem entrega apenas `dist/`.

## Parser e representação ordenada

`JSON.parse` aplicado ao documento completo perde a escrita dos números e pode perder precisão. Objetos JavaScript também enumeram algumas chaves numéricas em ordem diferente da entrada. Por isso, o parser representa objetos como listas de pares e números como tokens textuais. `JSON.parse` é usado apenas para decodificar strings isoladas depois de sua sintaxe ser verificada.

O gerador produz outra árvore ordenada para o schema. O serializador não converte `properties` em objeto JavaScript: escreve os pares diretamente, escapando strings com `JSON.stringify`. Assim, chaves especiais não alteram protótipos e nomes numéricos mantêm sua posição.

## Inferência conservadora

Cada objeto exige seus próprios campos. Arrays heterogêneos combinam schemas em `anyOf`; alternativas idênticas são deduplicadas por sua representação ordenada, mantendo a primeira ocorrência. Não se infere opcionalidade, limites de tamanho, enumeração ou formatos a partir de um único exemplo.

Não usamos `oneOf`, pois as alternativas podem se sobrepor. Não removemos uma alternativa `integer` quando também há `number`: isso preserva os tipos textuais observados, mesmo que haja redundância semântica.

## Responsividade e recursos

Um Worker novo executa cada geração. Editar a entrada, limpar ou cancelar encerra o Worker anterior. Respostas atrasadas são descartadas pela identidade do Worker e revisão do documento. O tempo máximo de 5 segundos é aplicado pela thread da interface, que pode encerrar o Worker mesmo se o parser estiver ocupado.

Há limites de bytes, profundidade e nós durante o parsing, e um limite de bytes na serialização. A construção intermediária ainda ocupa memória proporcional aos dados e estruturas inferidas; não há promessa de uso constante de memória. CodeMirror cuida da edição e destaque de sintaxe, com saída somente leitura.

## Publicação

GitHub Actions verifica o código e testa a versão de produção antes do deploy. O job de build possui apenas leitura do repositório; o job de deploy recebe `pages: write` e `id-token: write`. Pull requests não publicam. Deploys em andamento não são cancelados. O uso de caminhos relativos permite servir a aplicação no subdiretório do repositório.

## Evolução

O núcleo é separado da interface. Pode ganhar novos consumidores sem acessar DOM. Mudanças de inferência devem atualizar os exemplos e os testes de validade, aceitação e ordem. Para contratos mais completos, uma etapa futura pode permitir revisão manual explícita de obrigatoriedade e tipos; isso não faz parte da versão inicial.
