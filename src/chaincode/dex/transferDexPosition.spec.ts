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
import { GalaChainResponse, NotFoundError, TokenClass, TokenClassKey, TokenInstance } from "@gala-chain/api";
import { currency, fixture, users, writesMap } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { randomUUID } from "crypto";

import {
  DexFeePercentageTypes,
  DexPositionData,
  DexPositionOwner,
  Pool,
  TickData,
  TransferDexPositionDto
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";

describe("Transfer Dex Position", () => {
  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

  const currencyInstance: TokenInstance = currency.tokenInstance();
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();
  const currencyClass: TokenClass = currency.tokenClass();

  const dexInstance: TokenInstance = dex.tokenInstance();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();
  const dexClass: TokenClass = dex.tokenClass();

  let pool: Pool;

  beforeEach(() => {
    pool = new Pool(
      dexClassKey.toString(),
      currencyClassKey.toString(),
      dexClassKey,
      currencyClassKey,
      fee,
      new BigNumber("44.71236")
    );
  });

  test("LP provider should be able to transfer his dex position", async () => {
    //Given
    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition("75920:76110", "POSITION-ID");

    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), 75920);

    const tickUpperData = new TickData(pool.genPoolHash(), 76110);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("75646"));

    const { ctx, contract, getWrites } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        positionOwner,
        positionData,
        tickLowerData,
        tickUpperData
      );

    const dto = new TransferDexPositionDto();
    dto.toAddress = users.testUser2.identityKey;
    dto.token0 = dexClassKey;
    dto.token1 = currencyClassKey;
    dto.fee = 500;
    dto.positionId = "POSITION-ID";
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    await contract.TransferDexPosition(ctx, dto);

    const expectedOldPosition = new DexPositionOwner(
      users.testUser1.identityKey,
      "a225bce08a98af95a22deaf342d2a3bf50bbc4bc1a496aafa4cb7d93af40bbbc"
    );

    expectedOldPosition.tickRangeMap = {};
    const expectedNewPosition = new DexPositionOwner(
      users.testUser2.identityKey,
      "a225bce08a98af95a22deaf342d2a3bf50bbc4bc1a496aafa4cb7d93af40bbbc"
    );
    expectedNewPosition.tickRangeMap = { "75920:76110": ["POSITION-ID"] };

    //Then
    expect(getWrites()).toEqual(writesMap(expectedOldPosition, expectedNewPosition));
  });

  test("It will revert if position is not found", async () => {
    //Given
    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition("75920:76110", "POSITION-ID");

    const positionData = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );

    const tickLowerData = new TickData(pool.genPoolHash(), 75920);

    const tickUpperData = new TickData(pool.genPoolHash(), 76110);

    pool.mint(positionData, tickLowerData, tickUpperData, new BigNumber("75646"));

    const { ctx, contract } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .savedState(
        currencyClass,
        currencyInstance,
        dexInstance,
        dexClass,
        pool,
        positionOwner,
        positionData,
        tickLowerData,
        tickUpperData
      );

    const dto = new TransferDexPositionDto();
    dto.toAddress = users.testUser2.identityKey;
    dto.token0 = dexClassKey;
    dto.token1 = currencyClassKey;
    dto.fee = 500;
    dto.positionId = "POSITION-ID-O";
    dto.uniqueKey = randomUUID();

    dto.sign(users.testUser1.privateKey);

    //When
    const transferDexPositionRes = await contract.TransferDexPosition(ctx, dto);

    //Then
    expect(transferDexPositionRes).toEqual(
      GalaChainResponse.Error(
        new NotFoundError(
          "client|testUser1 does not hold hold any position for given POSITION-ID-O for this pool"
        )
      )
    );
  });
});
