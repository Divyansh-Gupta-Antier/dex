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
import {
  FeeThresholdUses,
  GalaChainResponse,
  TokenBalance,
  TokenClass,
  TokenClassKey,
  TokenInstance,
  ValidationFailedError,
  asValidUserAlias
} from "@gala-chain/api";
import { GalaChainContext } from "@gala-chain/chaincode";
import { currency, fixture, transactionError, users, writesMap } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";
import { randomUUID } from "crypto";

import { CreatePoolDto, CreatePoolResDto, DexFeeConfig, DexFeePercentageTypes, Pool } from "../../api/";
import { DexV3Contract } from "../DexV3Contract";
import dexTestUtils from "../test/dex";
import { generateKeyFromClassKey } from "./dexUtils";

describe("CreatePool", () => {
  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClass: TokenClass = currency.tokenClass();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();
  const currencyBalance: TokenBalance = currency.tokenBalance();

  const dexInstance: TokenInstance = dexTestUtils.tokenInstance();
  const dexClass: TokenClass = dexTestUtils.tokenClass();
  const dexClassKey: TokenClassKey = dexTestUtils.tokenClassKey();
  const dexBalance: TokenBalance = dexTestUtils.tokenBalance();

  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  const pool = new Pool(
    dexClassKey.toString(),
    currencyClassKey.toString(),
    dexClassKey,
    currencyClassKey,
    fee,
    new BigNumber("44.71236")
  );

  it("Should create a new liquidity pool and save it on-chain", async () => {
    //Given
    const dexFeeConfig: DexFeeConfig = new DexFeeConfig([asValidUserAlias(users.admin.identityKey)], 0.1);

    const { ctx, contract } = fixture<GalaChainContext, DexV3Contract>(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyInstance,
        currencyClass,
        currencyBalance,
        dexFeeConfig,
        dexInstance,
        dexClass,
        dexBalance
      )
      .savedRangeState([]);

    const dto = new CreatePoolDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_1_PERCENT,
      new BigNumber("1")
    );

    dto.uniqueKey = "randomUniquekey";

    dto.sign(users.testUser1.privateKey);

    const [token0, token1] = [dto.token0, dto.token1].map(generateKeyFromClassKey);
    const expectedPool = new Pool(token0, token1, dto.token0, dto.token1, dto.fee, dto.initialSqrtPrice, 0.1);

    const expectedResponse = new CreatePoolResDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_1_PERCENT,
      expectedPool.genPoolHash(),
      expectedPool.getPoolAlias()
    );

    // When
    const response = await contract.CreatePool(ctx, dto);

    // Then
    expect(response).toEqual(GalaChainResponse.Success(expectedResponse));
  });

  it("Should create a new liquidity pool using a configured protocol fee", async () => {
    //Given
    const dexFeeConfig: DexFeeConfig = new DexFeeConfig([users.admin.identityKey], 0.3);

    const { ctx, contract, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyClass, dexFeeConfig, dexClass)
      .savedRangeState([]);

    const dto = new CreatePoolDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_05_PERCENT,
      new BigNumber("1")
    );

    dto.uniqueKey = "random-key";

    dto.sign(users.testUser1.privateKey);

    const expectedFeeThresholdUses = plainToInstance(FeeThresholdUses, {
      feeCode: "CreatePool",
      user: users.testUser1.identityKey,
      cumulativeUses: new BigNumber("1"),
      cumulativeFeeQuantity: new BigNumber("0")
    });

    // When
    const res = await contract.CreatePool(ctx, dto);

    const expectedPool = new Pool(
      dexClassKey.toStringKey(),
      currencyClassKey.toStringKey(),
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_05_PERCENT,
      new BigNumber("1"),
      dexFeeConfig.protocolFee
    );

    const expectedResponse = new CreatePoolResDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_05_PERCENT,
      expectedPool.genPoolHash(),
      expectedPool.getPoolAlias()
    );

    // Then
    expect(res).toEqual(GalaChainResponse.Success(expectedResponse));
    expect(getWrites()).toEqual(writesMap(expectedFeeThresholdUses, expectedPool));
  });

  it("Should create pool with default protocol fee when DexFeeConfig is not present", async () => {
    //Given

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyInstance, currencyClass, currencyBalance, dexInstance, dexClass, dexBalance);

    const dto = new CreatePoolDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_3_PERCENT,
      new BigNumber("1")
    );

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const expectedPool = new Pool(
      dexClassKey.toStringKey(),
      currencyClassKey.toStringKey(),
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_3_PERCENT,
      new BigNumber("1"),
      0.1 // default protocol fee
    );

    const expectedResponse = new CreatePoolResDto(
      dexClassKey,
      currencyClassKey,
      DexFeePercentageTypes.FEE_0_3_PERCENT,
      expectedPool.genPoolHash(),
      expectedPool.getPoolAlias()
    );

    //When
    const res = await contract.CreatePool(ctx, dto);

    //Then
    expect(res).toEqual(GalaChainResponse.Success(expectedResponse));
  });

  it("should revert if we create pool of same tokens", async () => {
    //Given
    const dto = new CreatePoolDto(currencyClassKey, currencyClassKey, 500, new BigNumber("10"));

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract).registeredUsers(users.testUser1);
    //When
    const createPoolRes = await contract.CreatePool(ctx, dto);

    //Then
    expect(createPoolRes).toEqual(
      GalaChainResponse.Error(
        new ValidationFailedError(
          "Cannot create pool of same tokens. Token0 TEST$Currency$TEST$none and Token1 TEST$Currency$TEST$none must be different."
        )
      )
    );

    expect(createPoolRes).toEqual(transactionError());
  });

  it("Should throw Validation Failed Error if token0 is greater than token1 ", async () => {
    //Given
    const dto = new CreatePoolDto(currencyClassKey, dexClassKey, 500, new BigNumber("10"));

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract).registeredUsers(users.testUser1);

    //When
    const createPoolRes = await contract.CreatePool(ctx, dto);

    //Then
    expect(createPoolRes).toEqual(
      GalaChainResponse.Error(new ValidationFailedError("Token0 must be smaller"))
    );
  });

  it("Should throw Conflict Error if pool is already created", async () => {
    //Given
    const dto = new CreatePoolDto(dexClassKey, currencyClassKey, 500, new BigNumber("44.71236"));

    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(currencyInstance, currencyClass, currencyBalance, dexInstance, dexClass, pool);

    //When
    const createPoolRes = await contract.CreatePool(ctx, dto);

    //Then
    expect(createPoolRes.Message).toEqual("Pool already exists");
    expect(createPoolRes.ErrorKey).toEqual("CONFLICT");
  });
});
