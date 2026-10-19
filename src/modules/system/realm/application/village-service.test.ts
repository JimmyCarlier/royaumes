import { describe, expect, it } from 'vitest'
import { createInMemoryVillageRepository } from '../infrastructure/in-memory-village-repository'
import { VersionConflictError } from './village-repository'
import { createVillageService } from './village-service'

// Horloge contrôlée par le test : l'instant courant est une simple variable.
function setup() {
  let now = Date.UTC(2026, 0, 1)
  const repo = createInMemoryVillageRepository()
  const service = createVillageService(repo, () => now)
  const advance = (minutes: number) => {
    now += minutes * 60_000
  }
  return { repo, service, advance }
}

describe('Service du Village', () => {
  it("n'a aucune vue tant que le village n'est pas fondé", async () => {
    const { service } = setup()
    expect(await service.getView('alice')).toBeNull()
  })

  it('fonde un village et renvoie sa vue', async () => {
    const { service } = setup()
    const result = await service.execute('alice', { type: 'FoundVillage', name: 'Valombre' })

    expect(result.ok).toBe(true)
    expect((await service.getView('alice'))?.name).toBe('Valombre')
  })

  it('enregistre les événements et fait évoluer la vue avec le temps', async () => {
    const { service, advance } = setup()
    await service.execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    advance(5)
    await service.execute('alice', { type: 'UpgradeBuilding', building: 'mine' })
    advance(10)

    const view = await service.getView('alice')
    expect(view?.levels.mine).toBe(1)
    expect(view?.stock).toEqual({ wood: 170, stone: 80, gold: 20 })
  })

  it("renvoie l'erreur métier sans rien enregistrer", async () => {
    const { repo, service } = setup()
    await service.execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    const result = await service.execute('alice', { type: 'FoundVillage', name: 'Autre' })

    expect(result).toEqual({ ok: false, error: { code: 'ALREADY_FOUNDED' } })
    expect((await repo.load('alice')).version).toBe(1)
  })

  it('isole les villages des différents joueurs', async () => {
    const { service } = setup()
    await service.execute('alice', { type: 'FoundVillage', name: 'Valombre' })
    expect(await service.getView('bob')).toBeNull()
  })
})

describe('Adaptateur en mémoire', () => {
  it('refuse un enregistrement fondé sur une version périmée', async () => {
    const repo = createInMemoryVillageRepository()
    const founded = { type: 'VillageFounded', data: { name: 'Valombre', at: 0 } } as const
    await repo.save('alice', 0, [founded])

    // Un second enregistrement qui croit encore le village vide est refusé.
    await expect(repo.save('alice', 0, [founded])).rejects.toBeInstanceOf(VersionConflictError)
  })
})
