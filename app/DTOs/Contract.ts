import Contract from 'App/Models/Contract'
import Draft from 'App/Models/Draft'
import ExpectedMetric from 'App/Models/ExpectedMetric'

import { ContractStatus } from 'App/Helpers/constants'
import Lta from 'App/Models/Lta'

export interface ContractsStatusCount {
  counts: {
    status: string
    count: any
  }[]
  totalCount: number
}

export interface ContractListDTO {
  ltas: LtaList
  contracts: ContractList[]
}

interface LtaList {
  [name: string]: ContractList[]
}

interface ContractList {
  id: number
  name: string
  isp?: string
  status: string
  country?: {
    name: string
    code: string
    flagUrl: string
  }
  schoolsConnection?: SchoolsConnection
  numberOfSchools?: number
  budget?: {
    budget: string
    totalSpend: string
  }
  ltaId?: number
}

interface SchoolsConnection {
  withoutConnection: number
  atLeastOneBellowAvg: number
  allEqualOrAboveAvg: number
}

const contractCountByStatusDTO = (
  contracts: Contract[],
  totalCount: string,
  draftsCount: string
): ContractsStatusCount => {
  const counts = contracts.map((c) => ({
    status: ContractStatus[c.$attributes.status],
    count: c.$extras.count,
  }))
  counts[counts.length] = {
    status: ContractStatus[0],
    count: draftsCount,
  }
  return {
    counts,
    totalCount: parseInt(totalCount) + parseInt(draftsCount),
  }
}

const contractListDTO = (
  data: Contract[],
  drafts: Draft[],
  ltasData: Lta[],
  schoolsMeasures: {}
): ContractListDTO => {
  const ltas: LtaList = formatLtaList(ltasData)
  const contracts: ContractList[] = []

  drafts.map((draft) => {
    const draftData = {
      id: draft.id,
      name: draft.name,
      isp: draft.isp?.name,
      status: 'Draft',
      country: draft.country
        ? {
            name: draft.country.name,
            flagUrl: draft.country.flagUrl,
            code: draft.country.code,
          }
        : undefined,
      numberOfSchools: draft.schools?.schools.length,
      ltaId: draft.ltaId,
    }

    if (draft.ltaId) {
      if (ltas[draft.lta.name]) {
        ltas[draft.lta.name].push(draftData)
      }
    } else {
      contracts.push(draftData)
    }
  })

  data.map((contract) => {
    const schoolsConnection: SchoolsConnection = {
      withoutConnection: 0,
      atLeastOneBellowAvg: 0,
      allEqualOrAboveAvg: 0,
    }

    if (contract.schools.length) {
      contract.schools.map((school) => {
        evaluateMeasures(schoolsMeasures[school.name], contract.expectedMetrics, schoolsConnection)
      })
    }

    const contractData = {
      id: contract.id,
      name: contract.name,
      isp: contract.isp.name,
      status: ContractStatus[contract.status],
      country: {
        name: contract.country.name,
        flagUrl: contract.country.flagUrl,
        code: contract.country.code,
      },
      schoolsConnection,
      numberOfSchools: contract.$extras.schools_count,
      budget: {
        budget: contract.budget,
        totalSpend: contract.$extras.total_payments,
      },
      ltaId: contract.ltaId,
    }

    if (contract.ltaId) {
      if (ltas[contract.lta.name]) {
        ltas[contract.lta.name].push(contractData)
      }
    } else {
      contracts.push(contractData)
    }
  })

  return {
    ltas,
    contracts,
  }
}

const formatLtaList = (ltas: Lta[]) => {
  return ltas.reduce(
    (aggregate, current) => ({
      ...aggregate,
      [current.name]: [],
    }),
    {}
  )
}

const evaluateMeasures = (
  schoolMeasures: any[],
  expectedMetrics: ExpectedMetric[],
  schoolsConnection: SchoolsConnection
) => {
  if (!schoolMeasures.length) return (schoolsConnection.withoutConnection += 1)
  for (const em of expectedMetrics) {
    const index = schoolMeasures.findIndex(
      (sm) => sm.metricId.toString() === em.metricId.toString()
    )
    if (schoolMeasures[index]?.$extras.avg < em.value) {
      return (schoolsConnection.atLeastOneBellowAvg += 1)
    }
  }
  return (schoolsConnection.allEqualOrAboveAvg += 1)
}

export default {
  contractCountByStatusDTO,
  contractListDTO,
}
