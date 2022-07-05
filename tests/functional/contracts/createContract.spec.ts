import { test } from '@japa/runner'
import Database from '@ioc:Adonis/Lucid/Database'
import { DateTime } from 'luxon'

import UserFactory from 'Database/factories/UserFactory'
import DraftFactory from 'Database/factories/DraftFactory'
import FrequencyFactory from 'Database/factories/FrequencyFactory'
import CountryFactory from 'Database/factories/CountryFactory'
import CurrencyFactory from 'Database/factories/CurrencyFactory'
import IspFactory from 'Database/factories/IspFactory'
import SchoolFactory from 'Database/factories/SchoolFactory'
import MetricFactory from 'Database/factories/MetricFactory'
import Metric from 'App/Models/Metric'
import Contract from 'App/Models/Contract'
import Draft from 'App/Models/Draft'
import ExpectedMetric from 'App/Models/ExpectedMetric'
import { ApiClient } from '@japa/api-client'
import User from 'App/Models/User'
import Attachment from 'App/Models/Attachment'

import testUtils from '../../utils'
import StatusTransition from 'App/Models/StatusTransition'
import { ContractStatus } from 'App/Helpers/constants'

const requiredFields = [
  'name',
  'countryId',
  'governmentBehalf',
  'currencyId',
  'budget',
  'frequencyId',
  'startDate',
  'ispId',
  'endDate',
  'createdBy',
  'schools',
  'expectedMetrics',
]

const lower20Pdf = `${__dirname}/lower_20.pdf`

test.group('Create Contract', (group) => {
  group.each.setup(async () => {
    await Database.beginGlobalTransaction()
    return () => Database.rollbackGlobalTransaction()
  })
  test('Successfully create a contract', async ({ client, expect }) => {
    const user = await UserFactory.with('roles', 1, (role) => {
      role.with('permissions', 1, (permission) => permission.merge({ name: 'contract.write' }))
    }).create()
    const { country, currency, frequency, isp, metrics, school } = await setupModels()
    const body = buildContract(
      'Contract 1',
      country.id,
      currency.id,
      frequency.id,
      isp.id,
      user.id,
      buildManyToMany([school.id], 'schools'),
      buildMetrics(metrics)
    )
    const response = await client.post('/contract').loginAs(user).json(body)
    const contractRes = response.body()
    expect(contractRes.country_id).toBe(country.id)
    expect(contractRes.currency_id).toBe(currency.id)
    expect(contractRes.budget).toBe('1000')
    expect(contractRes.frequency_id).toBe(frequency.id)
    expect(contractRes.isp_id).toBe(isp.id)
    expect(contractRes.created_by).toBe(user.id)
    expect(contractRes.status).toBe(1)
    const contract = await Contract.find(contractRes.id)
    await contract?.load('schools')
    await contract?.load('expectedMetrics')
    expect(contract?.$preloaded.schools[0].$attributes.name).toBe(school.name)
    expect((contract?.$preloaded.expectedMetrics as ExpectedMetric[]).length).toBe(4)
  })
  test('Successfully create a contract from a draft', async ({ client, expect }) => {
    const user = await UserFactory.with('roles', 1, (role) => {
      role.with('permissions', 2, (permission) =>
        permission.merge([{ name: 'contract.write' }, { name: 'attachment.write' }])
      )
    }).create()
    const { country, currency, frequency, isp, metrics, school } = await setupModels()
    const draft = await DraftFactory.create()
    const attachment = await createAttachment(client, user, draft.id)
    const body = buildContract(
      'Contract 1',
      country.id,
      currency.id,
      frequency.id,
      isp.id,
      user.id,
      buildManyToMany([school.id], 'schools'),
      buildMetrics(metrics),
      [{ id: attachment.id }],
      draft.id
    )
    const response = await client.post('/contract').loginAs(user).json(body)
    const contractRes = response.body()
    expect(contractRes.country_id).toBe(country.id)
    expect(contractRes.currency_id).toBe(currency.id)
    expect(contractRes.budget).toBe('1000')
    expect(contractRes.frequency_id).toBe(frequency.id)
    expect(contractRes.isp_id).toBe(isp.id)
    expect(contractRes.created_by).toBe(user.id)
    expect(contractRes.status).toBe(1)
    const contract = await Contract.find(contractRes.id)
    await contract?.load('schools')
    await contract?.load('expectedMetrics')
    await contract?.load('attachments')
    expect(contract?.$preloaded.schools[0].$attributes.name).toBe(school.name)
    expect((contract?.$preloaded.expectedMetrics as ExpectedMetric[]).length).toBe(4)
    expect(contract?.attachments.length).toBe(1)
    expect(contract?.attachments[0].id).toBe(attachment.id)
    const deletedDraft = await Draft.findBy('id', draft.id)
    expect(deletedDraft).toBe(null)
    const status = await StatusTransition.all()
    expect(status.length).toBe(1)
    expect(status[0].who).toBe(user.id)
    expect(status[0].contractId).toBe(contract?.id)
    expect(status[0].initialStatus).toBe(ContractStatus.Draft)
    expect(status[0].finalStatus).toBe(ContractStatus.Sent)
    // @ts-ignore: Unreachable code error
    expect(status[0].data?.draftCreation).toBe(draft.createdAt?.toString())
  })
  test('Successfully rollback the transaction if a error occur', async ({
    client,
    expect,
    assert,
  }) => {
    const user = await UserFactory.with('roles', 1, (role) => {
      role.with('permissions', 1, (permission) => permission.merge({ name: 'contract.write' }))
    }).create()
    const { country, currency, frequency, isp, metrics } = await setupModels()
    const draft = await DraftFactory.create()
    const body = buildContract(
      'Contract 1',
      country.id,
      currency.id,
      frequency.id,
      isp.id,
      user.id,
      buildManyToMany([1123], 'schools'),
      buildMetrics(metrics),
      undefined,
      draft.id
    )
    const response = await client.post('/contract').loginAs(user).json(body)
    const error = response.error() as import('superagent').HTTPError
    expect(error.status).toBe(424)
    expect(error.text).toBe('FAILED_DEPENDENCY: Some dependency failed while creating contract')
    const contracts = await Contract.all()
    assert.isEmpty(contracts)
  })
  test('Successfully rollback the transaction if a error occur', async ({ client, expect }) => {
    const user = await UserFactory.with('roles', 1, (role) => {
      role.with('permissions', 1, (permission) => permission.merge({ name: 'contract.write' }))
    }).create()
    const response = await client.post('/contract').loginAs(user).json({})
    const error = response.error() as import('superagent').HTTPError
    expect(error.status).toBe(422)
    expect(JSON.parse(error.text).errors.length).toBe(12)
    JSON.parse(error.text).errors.map((e) => {
      expect(e.message).toBe('required validation failed')
      expect(e.rule).toBe('required')
      expect(requiredFields.some((v) => v === e.field)).toBeTruthy()
    })
  })
  test('Throw a error when creating a contract from a draft if invalid id', async ({
    client,
    expect,
  }) => {
    const user = await UserFactory.with('roles', 1, (role) => {
      role.with('permissions', 1, (permission) => permission.merge({ name: 'contract.write' }))
    }).create()
    const { country, currency, frequency, isp, metrics, school } = await setupModels()
    await DraftFactory.create()
    const body = buildContract(
      'Contract 1',
      country.id,
      currency.id,
      frequency.id,
      isp.id,
      user.id,
      buildManyToMany([school.id], 'schools'),
      buildMetrics(metrics),
      undefined,
      100001
    )
    const response = await client.post('/contract').loginAs(user).json(body)
    const error = response.error() as import('superagent').HTTPError
    expect(error.status).toBe(404)
    expect(error.text).toBe('NOT_FOUND: Draft not found')
  })
})

const setupModels = async () => {
  const country = await CountryFactory.create()
  const currency = await CurrencyFactory.create()
  const frequency = await FrequencyFactory.create()
  const isp = await IspFactory.create()
  const metrics = await MetricFactory.createMany(4)
  const school = await SchoolFactory.merge({
    countryId: country.id,
  }).create()
  return { country, currency, frequency, isp, metrics, school }
}

const buildContract = (
  name?: string,
  countryId?: number,
  currencyId?: number,
  frequencyId?: number,
  ispId?: number,
  createdBy?: number,
  schools?: object,
  expectedMetrics?: object,
  attachments?: object,
  draftId?: number
) => ({
  name,
  governmentBehalf: false,
  countryId,
  currencyId,
  budget: '1000',
  frequencyId,
  startDate: DateTime.now(),
  endDate: DateTime.now(),
  ispId,
  createdBy,
  attachments,
  ...schools,
  ...expectedMetrics,
  draftId,
})

const buildMetrics = (metrics: Metric[]) => ({
  expectedMetrics: {
    metrics: metrics.map((m) => ({
      metricId: m.id,
      value: 1,
    })),
  },
})

const buildManyToMany = (modelsId: number[], modelName: string) => ({
  [modelName]: {
    [modelName]: modelsId.map((id) => ({
      id,
    })),
  },
})

const createAttachment = async (client: ApiClient, user: User, typeId: number) => {
  const file = await testUtils.toBase64('data:application/pdf;base64,', lower20Pdf)
  const response = await client
    .post('/attachments/upload')
    .loginAs(user)
    .json({ file, type: 'draft', typeId, name: 'fake name' })
  const attachment = response.body() as Attachment
  return attachment
}
