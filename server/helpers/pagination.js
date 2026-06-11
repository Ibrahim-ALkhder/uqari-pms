'use strict';

function paginate(queryFn, params, page, limit) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    const offset = (pageNum - 1) * limitNum;

    const data = queryFn([...params, limitNum, offset]);
    return { data, pagination: { page: pageNum, limit: limitNum } };
}

function paginatedResponse(res, total, data, pagination) {
    const { page, limit } = pagination;
    return res.status(200).json({
        success: true,
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
        },
    });
}

module.exports = { paginate, paginatedResponse };
