// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    type: 'lib',
    pnpm: true,
    rules: {
      'ts/explicit-function-return-type': 'off',
      'ts/consistent-type-imports': 'off',
      'pnpm/yaml-no-unused-catalog-item': 'off',
    },
  },
)
