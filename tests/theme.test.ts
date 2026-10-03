import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  getThemeForeground,
  getThemeStyle,
  normalizeTheme,
  parseThemeColor,
  THEME_PRESETS,
} from '../utils/theme'

test('provides twelve distinct palettes and keeps Grok adaptive by default', () => {
  assert.equal(THEME_PRESETS.length, 12)
  assert.equal(new Set(THEME_PRESETS.map(preset => preset.color)).size, 12)
  for (const preset of THEME_PRESETS) {
    assert.equal(normalizeTheme(preset.id), preset.id)
    assert.equal(parseThemeColor(preset.color), preset.color)
  }
  for (const value of [undefined, null, {}, 'missing', 42]) {
    assert.equal(normalizeTheme(value), 'grok')
    assert.deepEqual(getThemeStyle(value), {})
  }
})

test('accepts RGB input in comma and space syntax and canonicalizes stored colors', () => {
  for (const input of [
    'rgb(29,155,240)',
    ' 29, 155, 240 ',
    'RGB(29 155 240)',
    '029,155,240',
  ]) {
    assert.equal(parseThemeColor(input), 'rgb(29, 155, 240)')
    assert.equal(normalizeTheme(input), 'rgb(29, 155, 240)')
  }
  assert.equal(parseThemeColor('0, 0, 0'), 'rgb(0, 0, 0)')
  assert.equal(parseThemeColor('255, 255, 255'), 'rgb(255, 255, 255)')
})

test('rejects invalid RGB channels, transparency and arbitrary CSS before persistence', () => {
  for (const input of [
    '',
    '256,0,0',
    '-1,0,0',
    '1.5,0,0',
    '1,2',
    '1,2,3,4',
    'rgb(1, 2, 3',
    'rgb(1, 2 3)',
    'rgba(1,2,3,0)',
    'rgb(1 2 3 / 50%)',
    '100%,0%,0%',
    'var(--color)',
    'rebeccapurple',
    'url(https://example.com)',
    '1,2,3);color:red',
  ]) {
    assert.equal(parseThemeColor(input), undefined, input)
    assert.equal(normalizeTheme(input), 'grok', input)
  }
})

test('chooses readable button text for bright and dark custom colors', () => {
  for (const color of [
    '255,255,255',
    '255,255,0',
    '29,155,240',
    '132,204,22',
  ]) {
    assert.equal(getThemeForeground(color), '#000000')
  }
  for (const color of ['0,0,0', '15,20,25', '79,70,229', '147,51,234']) {
    assert.equal(getThemeForeground(color), '#ffffff')
  }
  assert.deepEqual(getThemeStyle('blue'), getThemeStyle('29,155,240'))
})
