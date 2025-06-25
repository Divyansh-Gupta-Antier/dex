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
import { NotFoundError, TokenClassKey } from "@gala-chain/api";
import { currency, fixture, users } from "@gala-chain/test";
import BigNumber from "bignumber.js";
import { plainToInstance } from "class-transformer";

import {
  DexFeePercentageTypes,
  DexPositionData,
  DexPositionOwner,
  GetPositionByIdDto,
  Pool
} from "../../api";
import { DexV3Contract } from "../DexV3Contract";
import dex from "../test/dex";
import { genTickRange } from "./dexUtils";
import { getPositionById } from "./getPositionById";
import { removePositionIfEmpty } from "./removePositionIfEmpty";

describe("Remove Position if Empty", () => {
  const currencyClassKey: TokenClassKey = currency.tokenClassKey();
  const dexClassKey: TokenClassKey = dex.tokenClassKey();

  const fee = DexFeePercentageTypes.FEE_0_05_PERCENT;

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

  it("Should delete position if token if tokensOwed0, tokensOwed1, and liquidity are negligible", async () => {
    //Given
    const position = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );
    position.tokensOwed0 = new BigNumber("0.00000000005");
    position.tokensOwed1 = new BigNumber("0.00000000005");
    position.liquidity = new BigNumber("0.0000000005");

    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition(genTickRange(75920, 76110), "POSITION-ID");

    const { ctx } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .callingUser(users.testUser1)
      .savedState(position, pool, positionOwner);

    const dto = new GetPositionByIdDto();
    dto.poolHash = pool.genPoolHash();
    dto.tickUpper = 76110;
    dto.tickLower = 75920;
    dto.positionId = "POSITION-ID";

    // When
    await removePositionIfEmpty(ctx, pool.genPoolHash(), position);

    // Then
    await expect(getPositionById(ctx, dto)).rejects.toThrow(NotFoundError);
  });

  test("Should NOT delete position if tokens or liquidity are above threashold ", async () => {
    //Given
    const position = new DexPositionData(
      pool.genPoolHash(),
      "POSITION-ID",
      76110,
      75920,
      dexClassKey,
      currencyClassKey,
      fee
    );
    position.tokensOwed0 = new BigNumber("0.000005");
    position.tokensOwed1 = new BigNumber("0.00005");
    position.liquidity = new BigNumber("0.000005");

    const positionOwner = new DexPositionOwner(users.testUser1.identityKey, pool.genPoolHash());
    positionOwner.addPosition(genTickRange(75920, 76110), "POSITION-ID");

    const { ctx } = fixture(DexV3Contract)
      .registeredUsers(users.testUser1)
      .callingUser(users.testUser1)
      .savedState(position, pool, positionOwner);

    const dto = new GetPositionByIdDto();
    dto.poolHash = pool.genPoolHash();
    dto.tickUpper = 76110;
    dto.tickLower = 75920;
    dto.positionId = "POSITION-ID";

    // When
    await removePositionIfEmpty(ctx, pool.genPoolHash(), position);

    const expectedRes = plainToInstance(DexPositionData, {
      poolHash: pool.genPoolHash(),
      positionId: "POSITION-ID",
      tickUpper: 76110,
      tickLower: 75920,
      liquidity: new BigNumber("0.000005"),
      feeGrowthInside0Last: new BigNumber("0"),
      feeGrowthInside1Last: new BigNumber("0"),
      tokensOwed0: new BigNumber("0.000005"),
      tokensOwed1: new BigNumber("0.00005"),
      token0ClassKey: dexClassKey,
      token1ClassKey: currencyClassKey,
      fee: fee
    });

    //Then
    expect(await getPositionById(ctx, dto)).toEqual(expectedRes);
  });
});
