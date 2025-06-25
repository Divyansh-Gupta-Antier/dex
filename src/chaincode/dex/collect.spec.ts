/*
 * Copyright (c) Gala Games Inc. All rights reserved.
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import { TokenBalance, TokenClass, TokenClassKey, TokenInstance } from "@gala-chain/api";
import { currency, fixture, transactionSuccess, users } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import {
  CollectDto,
  DexFeePercentageTypes,
  DexOperationResDto,
  DexPositionData,
  DexPositionOwner,
  Pool,
  TickData,
  UserBalanceResDto
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";
import { genTickRange } from "./dexUtils";

describe("Collect", () => {
  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClass: TokenClass = currency.tokenClass();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();

  const dexInstance: TokenInstance = dex.tokenInstance();
  const dexClass: TokenClass = dex.tokenClass();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();

  let pool: Pool;
  let positionData: DexPositionData;
  let positionOwner: DexPositionOwner;
  let tickLowerData: TickData;
  let tickUpperData: TickData;
  let dexPoolBalance: TokenBalance;
  let currencyPoolBalance: TokenBalance;

  beforeEach(() => {
    pool = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("44.71236")
    );

    positionData = new DexPositionData(
      pool.genPoolHash(),
      "position-Id",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );

    positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition(genTickRange(75920, 76110), "position-Id");

    tickLowerData = plainToInstance(TickData, {
      poolHash: pool.genPoolHash(),
      tick: 75920,
      liquidityGross: new BigNumber("100"),
      initialised: true,
      liquidityNet: new BigNumber("100"),
      feeGrowthOutside0: new BigNumber("1"),
      feeGrowthOutside1: new BigNumber("1")
    });

    tickUpperData = plainToInstance(TickData, {
      ...tickLowerData,
      tick: 76110
    });

    currencyPoolBalance = plainToInstance(TokenBalance, {
      ...currency.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });

    dexPoolBalance = plainToInstance(TokenBalance, {
      ...dex.tokenBalancePlain(),
      owner: pool.getPoolAlias()
    });
  });

  it("Should Collect correct fees and update balances", async () => {
    //Given
    positionData.tokensOwed0 = new BigNumber("15");
    positionData.tokensOwed1 = new BigNumber("15");

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        positionData,
        tickUpperData,
        tickLowerData,
        positionOwner,
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new CollectDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("8"),
      new BigNumber("8"),
      75920,
      76110,
      "position-Id"
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.CollectPositionFees(ctx, dto);

    const expectedResponse = plainToInstance(DexOperationResDto, {
      userBalanceDelta: plainToInstance(UserBalanceResDto, {
        token0Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "DEX",
          additionalKey: "client:6337024724eec8c292f0118d",
          quantity: new BigNumber("8"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        },
        token1Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "TEST",
          additionalKey: "none",
          quantity: new BigNumber("8"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        }
      }),
      amounts: ["8", "8"],
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: 500,
      userAddress: "client|testUser1"
    });

    //Then
    expect(res).toEqual(transactionSuccess(expectedResponse));
  });

  it("Should cap amount requested to pool available balance", async () => {
    //Given
    positionData.tokensOwed0 = new BigNumber("1500");
    positionData.tokensOwed1 = new BigNumber("1500");

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        positionData,
        tickUpperData,
        tickLowerData,
        positionOwner,
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new CollectDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("1200"),
      new BigNumber("1200"),
      75920,
      76110,
      "position-Id"
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.CollectPositionFees(ctx, dto);

    const expectedResponse = plainToInstance(DexOperationResDto, {
      userBalanceDelta: plainToInstance(UserBalanceResDto, {
        token0Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "DEX",
          additionalKey: "client:6337024724eec8c292f0118d",
          quantity: new BigNumber("1000"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        },
        token1Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "TEST",
          additionalKey: "none",
          quantity: new BigNumber("1000"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        }
      }),
      amounts: ["1000", "1000"],
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: 500,
      userAddress: "client|testUser1"
    });

    //Then
    expect(res).toEqual(transactionSuccess(expectedResponse));
    expect(res.Data?.amounts[0]).toEqual("1000");
    expect(res.Data?.amounts[0]).toEqual("1000");
  });

  it("Should handle zero requested amount ", async () => {
    //Given
    positionData.tokensOwed0 = new BigNumber("15");
    positionData.tokensOwed1 = new BigNumber("15");

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        pool,
        positionData,
        tickUpperData,
        tickLowerData,
        positionOwner,
        dexClass,
        currencyClass,
        dexInstance,
        currencyInstance,
        currencyPoolBalance,
        dexPoolBalance
      );

    const dto = new CollectDto(
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("0"),
      new BigNumber("0"),
      75920,
      76110,
      "position-Id"
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const res = await contract.CollectPositionFees(ctx, dto);

    const expectedResponse = plainToInstance(DexOperationResDto, {
      userBalanceDelta: plainToInstance(UserBalanceResDto, {
        token0Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "DEX",
          additionalKey: "client:6337024724eec8c292f0118d",
          quantity: new BigNumber("0"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        },
        token1Balance: {
          owner: users.testUser1.identityKey,
          collection: "TEST",
          category: "Currency",
          type: "TEST",
          additionalKey: "none",
          quantity: new BigNumber("0"),
          instanceIds: [],
          inUseHolds: [],
          lockedHolds: []
        }
      }),
      amounts: ["0", "0"],
      poolHash: pool.genPoolHash(),
      poolAlias: pool.getPoolAlias(),
      poolFee: 500,
      userAddress: "client|testUser1"
    });

    //Then
    expect(res).toEqual(transactionSuccess(expectedResponse));
  });
});
