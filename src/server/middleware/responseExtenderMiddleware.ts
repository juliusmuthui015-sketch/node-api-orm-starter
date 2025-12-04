import { Request, Response, NextFunction } from "express";
import {Model} from "@/eloquent/Model";
import {QueryResult} from "@/eloquent/types";

declare global {
    namespace Express {
        interface Response {
            jsonAsync: <T extends { toJSONAsync: () => Promise<any> }>(data: T) => Promise<Response>;
        }
    }
}

function isQueryResult(obj: any): obj is QueryResult<any> {
    return obj &&
        typeof obj === "object" &&
        Array.isArray(obj.data);
}


export default function responseExtenderMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
) {
    res.jsonAsync = async function<T extends { toJSONAsync: () => Promise<any> }>(data: T): Promise<Response> {
        if(data instanceof Model){
            return res.json(await data.toJSONAsync());
        }
        if (isQueryResult(data)) {

            // If QueryResult.data has items, async convert them
            if (data.data.length > 0) {
                const processed = await Promise.all(
                    data.data.map(async (item: Model) => {
                        if (item?.toJSONAsync) {
                            return await item.toJSONAsync();
                        }
                        return item;
                    })
                );

                // Create a new QueryResult with replaced data
                const jsonResult = {
                    ...data,
                    data: processed
                };

                return res.json(jsonResult);
            }

            // If array empty, just return QueryResult as-is
            return res.json(data);
        }
        return res.json(data);
    };
    next();
}